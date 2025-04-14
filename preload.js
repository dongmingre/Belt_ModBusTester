const { contextBridge, ipcRenderer } = require('electron');

// 添加一些调试输出
console.log('preload.js 开始执行');

// 将 API 暴露给渲染进程
contextBridge.exposeInMainWorld('api', {
  // 服务器控制
  getServerStatus: () => {
    console.log('调用 getServerStatus');
    return ipcRenderer.invoke('get-server-status');
  },
  startServer: (port) => {
    console.log('调用 startServer, port:', port);
    return ipcRenderer.invoke('start-server', port);
  },
  stopServer: () => {
    console.log('调用 stopServer');
    return ipcRenderer.invoke('stop-server');
  },
  
  // 接收主进程的消息
  onServerStatus: (callback) => {
    console.log('注册 server-status 事件监听器');
    const listener = (_, status) => {
      console.log('收到服务器状态更新:', status);
      callback(status);
    };
    ipcRenderer.on('server-status', listener);
    return () => ipcRenderer.removeListener('server-status', listener);
  },
  
  // 网络接口
  getNetworkInterfaces: () => {
    console.log('调用 getNetworkInterfaces');
    return ipcRenderer.invoke('get-network-interfaces');
  },
  
  // 寄存器操作
  getRegisters: () => {
    console.log('调用 getRegisters');
    return ipcRenderer.invoke('get-registers')
      .then(data => {
        console.log('获取寄存器数据成功', data ? '数据有效' : '数据无效');
        return data;
      })
      .catch(err => {
        console.error('获取寄存器数据失败:', err);
        throw err;
      });
  },
  writeRegister: (type, address, value) => {
    console.log(`调用 writeRegister, type: ${type}, address: ${address}, value: ${value}`);
    return ipcRenderer.invoke('write-register', type, address, value)
      .then(result => {
        console.log('写入寄存器结果:', result);
        return result;
      })
      .catch(err => {
        console.error('写入寄存器失败:', err);
        throw err;
      });
  },
  
  // 寄存器数据更新
  onRegistersData: (callback) => {
    console.log('注册 registers-data 事件监听器');
    const listener = (_, data) => {
      console.log('收到寄存器数据更新:', data ? '数据有效' : '数据无效');
      if (data) {
        try {
          callback(data);
        } catch (err) {
          console.error('处理寄存器数据更新时出错:', err);
        }
      } else {
        console.warn('收到无效的寄存器数据更新');
      }
    };
    ipcRenderer.on('registers-data', listener);
    return () => ipcRenderer.removeListener('registers-data', listener);
  },
  
  // 日志消息
  onLogMessage: (callback) => {
    console.log('注册 log-message 事件监听器');
    const listener = (_, data) => {
      console.log('收到日志消息:', data.message);
      try {
        callback(data);
      } catch (err) {
        console.error('处理日志消息时出错:', err);
      }
    };
    ipcRenderer.on('log-message', listener);
    return () => ipcRenderer.removeListener('log-message', listener);
  },

  // 寄存器变化
  onRegistersChanged: (callback) => {
    console.log('注册 registers-changed 事件监听器');
    const listener = (_, changes) => {
      console.log('收到寄存器变化通知:', changes ? changes.length : 0, '项变化');
      if (changes && changes.length > 0) {
        try {
          callback(changes);
        } catch (err) {
          console.error('处理寄存器变化通知时出错:', err);
        }
      }
    };
    ipcRenderer.on('registers-changed', listener);
    return () => ipcRenderer.removeListener('registers-changed', listener);
  },
  
  // 点表和历史记录
  getPointTable: () => {
    console.log('调用 getPointTable');
    return ipcRenderer.invoke('get-point-table')
      .then(data => {
        console.log('获取点表成功, 条目数:', data ? data.length : 0);
        return data;
      })
      .catch(err => {
        console.error('获取点表失败:', err);
        throw err;
      });
  },
  getRegisterHistory: () => {
    console.log('调用 getRegisterHistory');
    return ipcRenderer.invoke('get-register-history')
      .then(data => {
        console.log('获取历史记录成功, 条目数:', data ? data.length : 0);
        return data;
      })
      .catch(err => {
        console.error('获取历史记录失败:', err);
        throw err;
      });
  },
  
  // Python 测试脚本生成
  generatePythonTest: (options) => {
    console.log('调用 generatePythonTest, 选项:', options);
    return ipcRenderer.invoke('generate-python-test', options)
      .then(result => {
        console.log('生成Python测试脚本结果:', result.success ? '成功' : '失败');
        return result;
      })
      .catch(err => {
        console.error('生成Python测试脚本失败:', err);
        throw err;
      });
  }
});

// 日志记录已暴露的API方法
const apiMethods = {
  getServerStatus: true,
  startServer: true,
  stopServer: true,
  onServerStatus: true,
  getNetworkInterfaces: true,
  getRegisters: true,
  writeRegister: true,
  onRegistersData: true,
  onLogMessage: true,
  onRegistersChanged: true,
  getPointTable: true,
  getRegisterHistory: true,
  generatePythonTest: true
};

console.log('preload.js 执行完成，已暴露 API:', 'api');
console.log('暴露的 API 方法:', Object.keys(apiMethods));