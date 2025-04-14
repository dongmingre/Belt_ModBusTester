const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
// const net = require('net'); // net is likely handled internally by modbus-serial for TCP server
// const modbus = require('jsmodbus'); // Remove jsmodbus
const ModbusRTU = require('modbus-serial'); // Import modbus-serial
const os = require('os');

// --- 添加全局未捕获异常处理器 (保持) ---
process.on('uncaughtException', (err, origin) => {
  console.error('主进程: UNCAUGHT EXCEPTION:', err);
  console.error('主进程: Origin:', origin);
  logMessage(`严重错误: 未捕获的异常 - ${err.message} (Origin: ${origin})`);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('主进程: UNHANDLED REJECTION at:', promise, 'reason:', reason);
  logMessage(`严重错误: 未处理的 Promise Rejection - ${reason}`);
});
// --- 结束添加 ---

// 导入并初始化 @electron/remote 模块
const remoteMain = require('@electron/remote/main');
remoteMain.initialize();

// 保持对窗口对象的全局引用，避免 JavaScript 对象被垃圾回收时窗口关闭
let mainWindow;
// Modbus 服务器实例 (使用 modbus-serial)
let serverTCP = null; // Changed variable name for clarity
// 服务器状态
let serverStatus = 'stopped';

// 模拟寄存器数据存储 (保持不变)
const registers = {
  coils: Buffer.alloc(100).fill(0),
  discreteInputs: Buffer.alloc(100).fill(0),
  holdingRegisters: Buffer.alloc(200).fill(0),
  inputRegisters: Buffer.alloc(200).fill(0)
};

// 点表定义 (保持不变)
const pointTable = [
  { addr: 0, realAddr: 40001, name: "煤量", access: "R/W", description: "煤量值（可读写）" },
  { addr: 1, realAddr: 40002, name: "跑偏", access: "R/W", description: "跑偏状态（可读写）" },
  { addr: 2, realAddr: 40003, name: "大块", access: "R/W", description: "大块状态（可读写）" },
  { addr: 3, realAddr: 40004, name: "烟雾", access: "R/W", description: "烟雾状态（可读写）" },
  { addr: 4, realAddr: 40005, name: "人员越位", access: "R/W", description: "人员越位状态（可读写）" },
  { addr: 5, realAddr: 40006, name: "备用1", access: "R/W", description: "备用寄存器1（可读写）" },
  { addr: 6, realAddr: 40007, name: "备用2", access: "R/W", description: "备用寄存器2（可读写）" },
  { addr: 7, realAddr: 40008, name: "报警使能", access: "R/W", description: "报警使能控制：bit0-大块，bit1-异物，bit2-人员越界，bit3-跑偏" },
  { addr: 8, realAddr: 40009, name: "异物", access: "R/W", description: "异物状态（可读写）" }
];

// 保存上一次的寄存器值，用于变化检测 (保持不变)
let previousRegisterValues = {
  holdingRegisters: Array(registers.holdingRegisters.length / 2).fill(0)
};

// 初始化保持寄存器的值 (保持不变)
// 煤量(40001)初始值设置为1000
registers.holdingRegisters.writeUInt16BE(1000, 0 * 2);
// 报警使能(40008)初始值设置为0x0F (所有报警都启用)
registers.holdingRegisters.writeUInt16BE(0x0F, 7 * 2);

// 保存寄存器变化记录 (保持不变)
const registerChangeHistory = [];

// 创建并配置主窗口 (保持不变)
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });
  
  // 为窗口启用remote模块
  remoteMain.enable(mainWindow.webContents);

  // 加载应用的 index.html
  mainWindow.loadFile('index.html');
  
  // 打开开发者工具 (开发时可用)
  mainWindow.webContents.openDevTools();
  
  // 添加控制台输出，以确认 preload 脚本是否正确加载
  console.log('主进程: 正在创建窗口，preload 脚本路径:', path.join(__dirname, 'preload.js'));

  // 当窗口关闭时触发
  mainWindow.on('closed', function () {
    // 解除窗口对象的引用
    mainWindow = null;
    
    // 如果服务器正在运行，则停止
    if (serverTCP) {
      stopModbusServer();
    }
  });
}

// 当 Electron 完成初始化并准备创建浏览器窗口时调用此方法 (保持不变)
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    // 在 macOS 上，当点击 dock 图标且没有其他窗口打开时，通常在应用程序中重新创建一个窗口
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 当所有窗口关闭时退出应用 (保持不变)
app.on('window-all-closed', function () {
  // 在 macOS 上，用户通常期望应用程序及其菜单栏保持活动状态，直到用户使用 Cmd + Q 明确退出
  if (process.platform !== 'darwin') app.quit();
});

// --- 重构: 启动 Modbus TCP 服务器 (使用 modbus-serial) ---
function startModbusServer(port = 502) {
  if (serverTCP) {
    return { success: false, message: '服务器已在运行中' };
  }

  try {
    // modbus-serial 使用 Vector 定义寄存器空间
    const vector = {
      getInputRegister: addr => {
        // addr is 0-based
        if (addr >= 0 && addr < registers.inputRegisters.length / 2) {
          return registers.inputRegisters.readUInt16BE(addr * 2);
        }
        // Consider throwing error or returning specific value for invalid address
        console.warn(`主进程: 无效的输入寄存器读取地址: ${addr}`);
        return 0; // Or throw error
      },
      getHoldingRegister: addr => {
        // addr is 0-based
        if (addr >= 0 && addr < registers.holdingRegisters.length / 2) {
          const value = registers.holdingRegisters.readUInt16BE(addr * 2);
          // console.log(`主进程: 读取保持寄存器: 地址=${addr}, 值=${value}`); // Optional detailed log
          return value;
        }
        console.warn(`主进程: 无效的保持寄存器读取地址: ${addr}`);
        return 0; // Or throw error
      },
      getCoil: addr => {
        if (addr >= 0 && addr < registers.coils.length) {
          const byteIndex = Math.floor(addr / 8);
          const bitIndex = addr % 8;
          return (registers.coils[byteIndex] & (1 << bitIndex)) !== 0;
        }
        console.warn(`主进程: 无效的线圈读取地址: ${addr}`);
        return false; // Or throw error
      },
      getDiscreteInput: addr => {
         if (addr >= 0 && addr < registers.discreteInputs.length) {
          const byteIndex = Math.floor(addr / 8);
          const bitIndex = addr % 8;
          return (registers.discreteInputs[byteIndex] & (1 << bitIndex)) !== 0;
        }
        console.warn(`主进程: 无效的离散输入读取地址: ${addr}`);
        return false; // Or throw error
      },
      setRegister: (addr, value) => {
        // addr is 0-based
        if (addr >= 0 && addr < registers.holdingRegisters.length / 2) {
          const oldValue = registers.holdingRegisters.readUInt16BE(addr * 2);
          logMessage(`写入保持寄存器: 地址=${addr}, 旧值=${oldValue}, 新值=${value}`);
          registers.holdingRegisters.writeUInt16BE(value, addr * 2);

          // --- 在这里触发更新 ---
          // 使用 setImmediate 确保在当前 Modbus 事务完成后执行
          setImmediate(() => {
            console.log('主进程: [modbus-serial setRegister] 准备更新渲染器');
            try {
              // 记录变化
              const registerName = getRegisterName(addr);
              registerChangeHistory.push({
                timestamp: new Date(),
                address: addr,
                realAddress: addr + 40001,
                name: registerName,
                oldValue: oldValue,
                newValue: value
              });
              // 通知渲染进程
              sendRegistersToRenderer();
              console.log('主进程: [modbus-serial setRegister] 渲染器更新完成');
            } catch(e) {
              console.error('主进程: [modbus-serial setRegister] 更新渲染器时出错:', e);
              logMessage(`错误: 处理寄存器写入后更新UI失败: ${e.message}`);
            }
          });
          // --- 结束触发更新 ---

          return; // Important: Must return void for success
        }
        console.error(`主进程: 无效的保持寄存器写入地址: ${addr}`);
        // To signal an error to the client, throw an exception.
        // See modbus-serial documentation for specific error types if needed.
        throw new Error("Illegal data address");
      },
      setCoil: (addr, value) => {
        if (addr >= 0 && addr < registers.coils.length) {
          const oldValue = vector.getCoil(addr); // Get old value using the vector method
          logMessage(`写入线圈: 地址=${addr}, 旧值=${oldValue}, 新值=${value}`);
          const byteIndex = Math.floor(addr / 8);
          const bitIndex = addr % 8;
          if (value) {
            registers.coils[byteIndex] |= (1 << bitIndex);
          } else {
            registers.coils[byteIndex] &= ~(1 << bitIndex);
          }
          // Trigger UI update similar to setRegister if needed
          setImmediate(() => {
             console.log('主进程: [modbus-serial setCoil] 准备更新渲染器');
             sendRegistersToRenderer(); // Simplified update for now
             console.log('主进程: [modbus-serial setCoil] 渲染器更新完成');
          });
          return; // Important: Must return void for success
        }
        console.error(`主进程: 无效的线圈写入地址: ${addr}`);
        throw new Error("Illegal data address");
      }
    };

    // 创建 Modbus TCP 服务器实例
    serverTCP = new ModbusRTU.ServerTCP(vector, {
      host: '0.0.0.0', // Listen on all interfaces
      port: port,
      debug: true, // Enable modbus-serial internal debugging logs
      unitID: 1 // Default Unit ID
    });

    // 监听错误事件
    serverTCP.on('socketError', (err) => {
      serverStatus = 'error';
      sendStatusToRenderer();
      logMessage(`服务器 Socket 错误: ${err.message}`);
      console.error('主进程: Modbus Socket Error:', err);
      // Attempt to close server if error occurs
      if (serverTCP && serverTCP.isOpen) {
         serverTCP.close(() => {
             logMessage('服务器因错误已关闭');
             serverTCP = null;
             serverStatus = 'stopped';
             sendStatusToRenderer();
         });
      } else {
         serverTCP = null;
         serverStatus = 'stopped';
         sendStatusToRenderer();
      }
    });

    // 监听启动 (modbus-serial doesn't have a specific 'listening' event like net.Server)
    // We rely on the constructor not throwing and log success immediately after.
    serverStatus = 'running';
    sendStatusToRenderer();
    logMessage(`服务器启动成功 (modbus-serial)，监听端口: ${port}`);
    console.log('主进程: modbus-serial server instance created and attempting to listen.');

    return { success: true, message: '服务器已启动 (modbus-serial)' };

  } catch (error) {
    serverStatus = 'error';
    sendStatusToRenderer();
    logMessage(`启动服务器失败 (modbus-serial): ${error.message}`);
    console.error("主进程: 启动 modbus-serial 服务器失败:", error);
    serverTCP = null; // Ensure server instance is null on error
    return { success: false, message: `启动服务器失败 (modbus-serial): ${error.message}` };
  }
}
// --- 结束重构 ---

// --- 重构: 停止 Modbus TCP 服务器 (使用 modbus-serial) ---
function stopModbusServer() {
  if (!serverTCP) {
    return { success: false, message: '服务器未运行' };
  }

  try {
    serverTCP.close(() => {
      serverStatus = 'stopped';
      sendStatusToRenderer();
      logMessage('服务器已停止 (modbus-serial)');
      serverTCP = null; // Clear the instance after closing
    });
    // Note: close is asynchronous, the status is updated in the callback.
    return { success: true, message: '服务器正在停止 (modbus-serial)' };
  } catch (error) {
    logMessage(`停止服务器错误 (modbus-serial): ${error.message}`);
    console.error("主进程: 停止 modbus-serial 服务器错误:", error);
    // Force state update if close throws sync error (less likely)
    serverTCP = null;
    serverStatus = 'stopped';
    sendStatusToRenderer();
    return { success: false, message: `停止服务器错误 (modbus-serial): ${error.message}` };
  }
}
// --- 结束重构 ---

// --- 移除: setupModbusCallbacks 函数不再需要，回调在 vector 中定义 ---
// function setupModbusCallbacks() { ... }
// --- 结束移除 ---

// 辅助函数：从请求中提取起始地址和数量 (不再需要，modbus-serial 提供单个地址)
// function extractAddressAndCount(request) { ... }

// 辅助函数：检查地址范围是否有效 (逻辑已移入 vector)
// function isValidRange(start, count, maxLength) { ... }

// 向渲染进程发送服务器状态更新 (保持不变)
function sendStatusToRenderer() {
  if (mainWindow) {
    mainWindow.webContents.send('server-status', serverStatus);
  }
}

// 向渲染进程发送日志消息 (保持不变)
function logMessage(message) {
  console.log(message);
  if (mainWindow) {
    mainWindow.webContents.send('log-message', {
      timestamp: new Date().toLocaleTimeString(),
      message: message
    });
  }
}

// 向渲染进程发送寄存器数据更新 (保持不变)
function sendRegistersToRenderer() {
  // 添加日志：检查 mainWindow 状态
  console.log(`主进程: 进入 sendRegistersToRenderer, mainWindow 是否存在: ${!!mainWindow}`);
  if (mainWindow) {
    try {
      // 构建用于发送的寄存器数据对象
      const registersData = {
        coils: getCoilsValues(),
        discreteInputs: getDiscreteInputsValues(),
        holdingRegisters: getHoldingRegistersValues(),
        inputRegisters: getInputRegistersValues()
      };
      
      // 添加日志：打印将要发送的保持寄存器数据
      console.log('主进程: 准备发送 holdingRegisters 数据:', registersData.holdingRegisters);

      // 检测保持寄存器的变化并记录
      const changedRegisters = detectRegisterChanges(registersData.holdingRegisters);
      
      // 保存当前值作为下一次比较的基准
      previousRegisterValues.holdingRegisters = [...registersData.holdingRegisters];
      
      // 发送数据和变化信息
      console.log('主进程: 正在向渲染进程发送 registers-data 事件');
      mainWindow.webContents.send('registers-data', registersData);
      
      // 如果有变化，发送变化通知
      if (changedRegisters.length > 0) {
        console.log('主进程: 正在向渲染进程发送 registers-changed 事件:', changedRegisters);
        mainWindow.webContents.send('registers-changed', changedRegisters);
      }
    } catch (error) {
      console.error('主进程: 向渲染进程发送数据失败:', error);
    }
  } else {
    // 添加日志：如果 mainWindow 不存在
    console.log('主进程: sendRegistersToRenderer 退出，因为 mainWindow 不存在');
  }
}

// 检测寄存器变化 (保持不变)
function detectRegisterChanges(currentValues) {
  const changes = [];
  
  for (let i = 0; i < currentValues.length; i++) {
    if (currentValues[i] !== previousRegisterValues.holdingRegisters[i]) {
      // 查找点表中的寄存器名称
      let registerName = `保持寄存器 ${i}`;
      
      const pointTableItem = pointTable.find(item => item.addr === i);
      if (pointTableItem) {
        registerName = pointTableItem.name;
      }
      
      // 记录变化
      const changeRecord = {
        timestamp: new Date(),
        address: i,
        realAddress: i + 40001,
        name: registerName,
        oldValue: previousRegisterValues.holdingRegisters[i],
        newValue: currentValues[i]
      };
      
      changes.push(changeRecord);
      
      // 保存到历史记录
      registerChangeHistory.push(changeRecord);
      
      // 限制历史记录大小
      if (registerChangeHistory.length > 1000) {
        registerChangeHistory.shift();
      }
    }
  }
  
  return changes;
}

// 辅助函数：获取线圈值数组 (保持不变)
function getCoilsValues() {
  const values = [];
  for (let i = 0; i < registers.coils.length; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = i % 8;
    const value = (registers.coils[byteIndex] & (1 << bitIndex)) !== 0;
    values.push(value);
  }
  return values;
}

// 辅助函数：获取离散输入值数组 (保持不变)
function getDiscreteInputsValues() {
  const values = [];
  for (let i = 0; i < registers.discreteInputs.length; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = i % 8;
    const value = (registers.discreteInputs[byteIndex] & (1 << bitIndex)) !== 0;
    values.push(value);
  }
  return values;
}

// 辅助函数：获取保持寄存器值数组 (保持不变)
function getHoldingRegistersValues() {
  const values = [];
  for (let i = 0; i < registers.holdingRegisters.length / 2; i++) {
    values.push(registers.holdingRegisters.readUInt16BE(i * 2));
  }
  return values;
}

// 辅助函数：获取输入寄存器值数组 (保持不变)
function getInputRegistersValues() {
  const values = [];
  for (let i = 0; i < registers.inputRegisters.length / 2; i++) {
    values.push(registers.inputRegisters.readUInt16BE(i * 2));
  }
  return values;
}

// 设置 IPC 通信处理器 (保持不变, start/stop 调用已更新的函数)
ipcMain.handle('start-server', async (event, port) => {
  return startModbusServer(port);
});

ipcMain.handle('stop-server', async () => {
  return stopModbusServer();
});

ipcMain.handle('get-server-status', () => {
  return serverStatus;
});

ipcMain.handle('get-registers', () => {
  return {
    coils: getCoilsValues(),
    discreteInputs: getDiscreteInputsValues(),
    holdingRegisters: getHoldingRegistersValues(),
    inputRegisters: getInputRegistersValues()
  };
});

ipcMain.handle('write-register', (event, type, address, value) => {
  try {
    if (type === 'coil') {
      // 写入线圈
      if (address >= 0 && address < registers.coils.length) {
        const byteIndex = Math.floor(address / 8);
        const bitIndex = address % 8;
        
        if (value) {
          registers.coils[byteIndex] |= (1 << bitIndex);
        } else {
          registers.coils[byteIndex] &= ~(1 << bitIndex);
        }
        
        logMessage(`通过 UI 修改线圈: 地址=${address}, 值=${value}`);
        sendRegistersToRenderer();
        return { success: true };
      }
    } 
    else if (type === 'holding') {
      // 写入保持寄存器
      if (address >= 0 && address < (registers.holdingRegisters.length / 2)) {
        registers.holdingRegisters.writeUInt16BE(value, address * 2);
        
        logMessage(`通过 UI 修改保持寄存器: 地址=${address}, 值=${value}`);
        sendRegistersToRenderer();
        return { success: true };
      }
    }
    else if (type === 'input') {
      // 写入输入寄存器 (通常不可写，但在模拟器中允许通过 UI 修改)
      if (address >= 0 && address < (registers.inputRegisters.length / 2)) {
        registers.inputRegisters.writeUInt16BE(value, address * 2);
        
        logMessage(`通过 UI 修改输入寄存器: 地址=${address}, 值=${value}`);
        sendRegistersToRenderer();
        return { success: true };
      }
    }
    else if (type === 'discrete') {
      // 写入离散输入 (通常不可写，但在模拟器中允许通过 UI 修改)
      if (address >= 0 && address < registers.discreteInputs.length) {
        const byteIndex = Math.floor(address / 8);
        const bitIndex = address % 8;
        
        if (value) {
          registers.discreteInputs[byteIndex] |= (1 << bitIndex);
        } else {
          registers.discreteInputs[byteIndex] &= ~(1 << bitIndex);
        }
        
        logMessage(`通过 UI 修改离散输入: 地址=${address}, 值=${value}`);
        sendRegistersToRenderer();
        return { success: true };
      }
    }
    
    return { 
      success: false, 
      message: `无效的寄存器类型 (${type}) 或地址 (${address})` 
    };
  } catch (error) {
    logMessage(`修改寄存器错误: ${error.message}`);
    return { 
      success: false, 
      message: `修改寄存器错误: ${error.message}` 
    };
  }
});

// 获取本地网络接口 (保持不变)
ipcMain.handle('get-network-interfaces', () => {
  try {
    const interfaces = os.networkInterfaces();
    const results = [];
    
    for (const [name, netInterface] of Object.entries(interfaces)) {
      for (const info of netInterface) {
        // 只添加 IPv4 地址
        if (info.family === 'IPv4' && !info.internal) {
          results.push({
            name,
            address: info.address
          });
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('获取网络接口错误:', error);
    return [];
  }
});

// 生成Python测试脚本 (保持不变)
ipcMain.handle('generate-python-test', (event, options) => {
  try {
    const { addresses, ip, port } = options;
    
    let pythonCode = '';
    
    // 导入部分 - 使用新版API
    pythonCode += '#!/usr/bin/env python\n';
    pythonCode += '# -*- coding: utf-8 -*-\n\n';
    pythonCode += '"""\n';
    pythonCode += '自动生成的Modbus TCP测试脚本\n';
    pythonCode += '生成时间: ' + new Date().toLocaleString() + '\n';
    pythonCode += '测试目标: ' + ip + ':' + port + '\n';
    pythonCode += '"""\n\n';
    pythonCode += '# 导入pymodbus (新版API)\n';
    pythonCode += 'from pymodbus.client import ModbusTcpClient\n';
    pythonCode += 'import time\n';
    pythonCode += 'import logging\n\n';
    
    // 设置日志
    pythonCode += '# 设置日志\n';
    pythonCode += 'logging.basicConfig()\n';
    pythonCode += 'log = logging.getLogger()\n';
    pythonCode += 'log.setLevel(logging.INFO)\n\n';
    
    // 客户端设置
    pythonCode += '# 连接参数\n';
    pythonCode += `SERVER_IP = "${ip}"\n`;
    pythonCode += `SERVER_PORT = ${port}\n\n`;
    
    // 主函数
    pythonCode += 'def main():\n';
    pythonCode += '    # 连接到服务器\n';
    pythonCode += '    log.info("正在连接到 %s:%s", SERVER_IP, SERVER_PORT)\n';
    pythonCode += '    client = ModbusTcpClient(SERVER_IP, port=SERVER_PORT)\n\n';
    
    pythonCode += '    try:\n';
    pythonCode += '        connected = client.connect()\n';
    pythonCode += '        if connected:\n';
    pythonCode += '            log.info("连接成功")\n\n';
    
    // 对每个地址生成测试代码
    pythonCode += '            # 读取测试\n';
    addresses.forEach(addr => {
      const realAddr = addr; // 这里是从0开始的Modbus地址
      const readableAddr = addr + 40001; // 这是人类可读的地址（从40001开始）
      const pointInfo = pointTable.find(p => p.addr === addr);
      const name = pointInfo ? pointInfo.name : "未知寄存器";
      
      pythonCode += `            # 读取 ${readableAddr} (${name})\n`;
      // 使用新版API
      pythonCode += `            result = client.read_holding_registers(${realAddr}, count=1)\n`;
      pythonCode += '            if not hasattr(result, "isError") or not result.isError():\n';
      pythonCode += `                log.info("${readableAddr} (${name}) = %s", result.registers[0])\n`;
      pythonCode += '            else:\n';
      pythonCode += `                log.error("读取 ${readableAddr} 失败")\n\n`;
    });
    
    // 写入测试
    pythonCode += '            # 写入测试\n';
    addresses.forEach(addr => {
      const realAddr = addr;
      const readableAddr = addr + 40001;
      const pointInfo = pointTable.find(p => p.addr === addr);
      
      if (pointInfo && pointInfo.access.includes('W')) {
        const name = pointInfo.name;
        const testValue = addr === 0 ? 1000 : 1; // 对于煤量使用1000，其他使用1
        
        pythonCode += `            # 写入 ${readableAddr} (${name})\n`;
        // 使用新版API
        pythonCode += `            write_result = client.write_register(${realAddr}, ${testValue})\n`;
        pythonCode += '            if not hasattr(write_result, "isError") or not write_result.isError():\n';
        pythonCode += `                log.info("已写入 ${readableAddr} (${name}) = ${testValue}")\n`;
        pythonCode += '            else:\n';
        pythonCode += `                log.error("写入 ${readableAddr} 失败")\n\n`;
        
        // 验证写入
        pythonCode += `            # 验证写入结果\n`;
        pythonCode += `            result = client.read_holding_registers(${realAddr}, count=1)\n`;
        pythonCode += '            if not hasattr(result, "isError") or not result.isError():\n';
        pythonCode += `                expected = ${testValue}\n`;
        pythonCode += '                actual = result.registers[0]\n';
        pythonCode += '                if actual == expected:\n';
        pythonCode += `                    log.info("验证成功: ${readableAddr} = %s", actual)\n`;
        pythonCode += '                else:\n';
        pythonCode += `                    log.error("验证失败: ${readableAddr} 期望值=%s, 实际值=%s", expected, actual)\n\n`;
      }
    });
    
    // 循环监控代码
    pythonCode += '            # 循环监控\n';
    pythonCode += '            log.info("开始循环监控 (按Ctrl+C终止)")\n';
    pythonCode += '            try:\n';
    pythonCode += '                while True:\n';
    
    // 只监控用户选择的地址
    pythonCode += '                    values = {}\n';
    addresses.forEach(addr => {
      const realAddr = addr;
      const readableAddr = addr + 40001;
      const pointInfo = pointTable.find(p => p.addr === addr);
      const name = pointInfo ? pointInfo.name : "未知寄存器";
      
      pythonCode += `                    # 监控 ${readableAddr} (${name})\n`;
      pythonCode += `                    result = client.read_holding_registers(${realAddr}, count=1)\n`;
      pythonCode += '                    if not hasattr(result, "isError") or not result.isError():\n';
      pythonCode += `                        values[${readableAddr}] = result.registers[0]\n`;
    });
    
    pythonCode += '                    # 显示当前值\n';
    pythonCode += '                    log.info("当前值: %s", values)\n';
    pythonCode += '                    time.sleep(1)\n';
    pythonCode += '            except KeyboardInterrupt:\n';
    pythonCode += '                log.info("监控终止")\n';
    
    // 结束清理
    pythonCode += '        else:\n';
    pythonCode += '            log.error("连接失败")\n';
    pythonCode += '    finally:\n';
    pythonCode += '        client.close()\n';
    pythonCode += '        log.info("连接已关闭")\n\n';
    
    // 添加安装说明
    pythonCode += '# 安装说明\n';
    pythonCode += '"""\n';
    pythonCode += '如果运行时提示缺少pymodbus模块，请使用以下命令安装：\n';
    pythonCode += 'pip install pymodbus\n';
    pythonCode += '"""\n\n';
    
    // 程序入口
    pythonCode += 'if __name__ == "__main__":\n';
    pythonCode += '    main()\n';
    
    return { 
      success: true, 
      code: pythonCode 
    };
  } catch (error) {
    console.error('生成Python测试代码错误:', error);
    return { 
      success: false, 
      message: `生成Python测试代码错误: ${error.message}`, 
      code: '' 
    };
  }
});

// 获取寄存器变化历史 (保持不变)
ipcMain.handle('get-register-history', () => {
  return registerChangeHistory;
});

// 获取点表信息 (保持不变)
ipcMain.handle('get-point-table', () => {
  return pointTable;
});

// 辅助函数：根据地址获取寄存器名称 (保持不变)
function getRegisterName(address) {
  const point = pointTable.find(p => p.addr === address);
  return point ? point.name : `保持寄存器 ${address}`;
}