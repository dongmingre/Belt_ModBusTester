// 渲染进程脚本 - 处理用户界面交互

// 常量定义
const DISPLAY_FORMATS = {
    dec: (value) => value.toString(10),
    hex: (value) => '0x' + value.toString(16).toUpperCase().padStart(4, '0'),
    bin: (value) => '0b' + value.toString(2).padStart(16, '0')
  };
  
  // 全局状态
  let currentDisplayFormat = 'dec';
  let pointTableData = [];
  let registerValues = {
    holdingRegisters: [],
    inputRegisters: [],
    coils: [],
    discreteInputs: []
  };
  let registerHistory = [];
  
  // 图表相关
  let registersChart = null;
  const chartColors = [
    '#0d6efd', '#dc3545', '#198754', '#ffc107', '#6f42c1',
    '#fd7e14', '#20c997', '#0dcaf0', '#6c757d', '#495057'
  ];
  const chartData = {
    labels: [],
    datasets: []
  };
  
  // DOM 元素
  let elements = {};
  
  // 在 DOM 加载完成后初始化
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM 已加载，开始初始化应用...');
    
    // 初始化元素引用
    initElements();
    
    // 初始化应用
    initApp();
  });
  
  // 初始化 DOM 元素引用
  function initElements() {
    try {
      // 基本元素
      elements.serverStatus = document.getElementById('server-status');
      elements.networkInfo = document.getElementById('network-info');
      elements.startServerBtn = document.getElementById('start-server');
      elements.stopServerBtn = document.getElementById('stop-server');
      elements.portInput = document.getElementById('port');
      elements.displayFormatSelect = document.getElementById('display-format');
      elements.pointTableBody = document.getElementById('point-table-body');
      elements.logContainer = document.getElementById('log-container');
      elements.holdingTableBody = document.getElementById('holding-table-body');
      elements.inputTableBody = document.getElementById('input-table-body');
      elements.coilsTableBody = document.getElementById('coils-table-body');
      elements.discreteTableBody = document.getElementById('discrete-table-body');
      elements.historyTableBody = document.getElementById('history-table-body');
      elements.autoScrollCheck = document.getElementById('auto-scroll-check');
      elements.clearLogBtn = document.getElementById('clear-log-btn');
      elements.clearHistoryBtn = document.getElementById('clear-history-btn');
      elements.exportHistoryBtn = document.getElementById('export-history-btn');
      elements.exportCsvBtn = document.getElementById('export-csv-btn');
      elements.generatePythonBtn = document.getElementById('generate-python-btn');
      elements.clearAlarmsBtn = document.getElementById('clear-alarms-btn');
      elements.registerChart = document.getElementById('register-chart');
      elements.chartRegisterSelect = document.getElementById('chart-register-select');
      
      console.log('DOM 元素引用初始化完成');
    } catch (error) {
      console.error('初始化 DOM 元素引用失败:', error);
    }
  }
  
  // 初始化应用
  async function initApp() {
    try {
      console.log('正在初始化应用...');
      
      // 设置事件监听器
      setupEventListeners();
      
      // 获取服务器状态
      const status = await window.api.getServerStatus();
      updateServerStatus(status);
      
      // 获取网络接口信息
      updateNetworkInfo();
      
      // 获取点表数据
      const pointTable = await window.api.getPointTable();
      if (pointTable && pointTable.length > 0) {
        pointTableData = pointTable;
        updatePointTable();
        console.log('点表数据加载完成:', pointTable.length, '项');
      } else {
        console.warn('无法获取点表数据或点表为空');
      }
      
      // 获取寄存器数据
      const registers = await window.api.getRegisters();
      if (registers) {
        registerValues = registers;
        updateRegistersDisplay();
        console.log('寄存器数据加载完成');
      } else {
        console.warn('无法获取寄存器数据');
      }
      
      // 获取历史记录
      const history = await window.api.getRegisterHistory();
      if (history) {
        registerHistory = history;
        updateHistoryTable();
        console.log('历史记录加载完成:', history.length, '项');
      }
      
      // 初始化图表
      if (elements.registerChart) {
        initChart();
        console.log('图表初始化完成');
      }
      
      console.log('应用初始化完成');
      
      // 添加初始日志
      addLogMessage({
        timestamp: new Date().toLocaleTimeString(),
        message: '应用已初始化，准备就绪。'
      });
    } catch (error) {
      console.error('初始化应用失败:', error);
      addLogMessage({
        timestamp: new Date().toLocaleTimeString(),
        message: '初始化应用失败: ' + error.message
      });
    }
  }
  
  // 设置事件监听器
  function setupEventListeners() {
    try {
      console.log('正在设置事件监听器...');
      
      // 服务器控制按钮
      if (elements.startServerBtn) {
        elements.startServerBtn.addEventListener('click', startServer);
        console.log('已设置启动服务器按钮事件');
      }
      
      if (elements.stopServerBtn) {
        elements.stopServerBtn.addEventListener('click', stopServer);
        console.log('已设置停止服务器按钮事件');
      }
      
      // 显示格式选择
      if (elements.displayFormatSelect) {
        elements.displayFormatSelect.addEventListener('change', (e) => {
          currentDisplayFormat = e.target.value;
          updateRegistersDisplay();
          updatePointTable();
        });
        console.log('已设置显示格式选择事件');
      }
      
      // 数据刷新按钮
      if (document.getElementById('refresh-data-btn')) {
        document.getElementById('refresh-data-btn').addEventListener('click', refreshRegistersData);
        console.log('已设置刷新数据按钮事件');
      }
      
      // 清除日志
      if (elements.clearLogBtn) {
        elements.clearLogBtn.addEventListener('click', () => {
          elements.logContainer.innerHTML = '';
        });
      }
      
      // 清除历史记录
      if (elements.clearHistoryBtn) {
        elements.clearHistoryBtn.addEventListener('click', () => {
          registerHistory = [];
          updateHistoryTable();
        });
      }
      
      // 导出历史记录为CSV
      if (elements.exportCsvBtn) {
        elements.exportCsvBtn.addEventListener('click', exportHistoryToCsv);
        console.log('已设置导出CSV按钮事件');
      }
      
      // 清除报警
      if (elements.clearAlarmsBtn) {
        elements.clearAlarmsBtn.addEventListener('click', clearAllAlarms);
      }
      
      // 生成Python测试脚本
      if (elements.generatePythonBtn) {
        elements.generatePythonBtn.addEventListener('click', showPythonGenerator);
        console.log('已设置生成Python测试脚本按钮事件');
      }
      
      // IPC 事件监听器
      window.api.onServerStatus(updateServerStatus);
      window.api.onLogMessage(addLogMessage);
      window.api.onRegistersData((data) => {
        registerValues = data;
        updateRegistersDisplay();
        updateChartData();
        updatePointTable(); // 确保点表也被更新
        console.log('收到寄存器数据更新', data.holdingRegisters.slice(0, 10)); // 调试日志
      });
      window.api.onRegistersChanged(handleRegisterChanges);
      
      console.log('所有事件监听器设置完成');
    } catch (error) {
      console.error('设置事件监听器失败:', error);
    }
  }
  
  // 启动服务器
  async function startServer() {
    if (!elements.portInput || !elements.startServerBtn) return;
    
    const port = parseInt(elements.portInput.value);
    if (isNaN(port) || port < 1 || port > 65535) {
      addLogMessage({
        timestamp: new Date().toLocaleTimeString(),
        message: '错误: 无效的端口号。请输入1-65535之间的数字。'
      });
      return;
    }
    
    try {
      elements.startServerBtn.disabled = true;
      const result = await window.api.startServer(port);
      
      if (!result || !result.success) {
        elements.startServerBtn.disabled = false;
        addLogMessage({
          timestamp: new Date().toLocaleTimeString(),
          message: `启动服务器失败: ${result ? result.message : '未知错误'}`
        });
      } else {
        addLogMessage({
          timestamp: new Date().toLocaleTimeString(),
          message: `服务器已在端口 ${port} 上启动`
        });
      }
    } catch (error) {
      elements.startServerBtn.disabled = false;
      addLogMessage({
        timestamp: new Date().toLocaleTimeString(),
        message: `启动服务器发生错误: ${error.message}`
      });
      console.error('启动服务器错误:', error);
    }
  }
  
  // 停止服务器
  async function stopServer() {
    if (!elements.stopServerBtn) return;
    
    try {
      elements.stopServerBtn.disabled = true;
      const result = await window.api.stopServer();
      
      if (!result || !result.success) {
        elements.stopServerBtn.disabled = false;
        addLogMessage({
          timestamp: new Date().toLocaleTimeString(),
          message: `停止服务器失败: ${result ? result.message : '未知错误'}`
        });
      } else {
        addLogMessage({
          timestamp: new Date().toLocaleTimeString(),
          message: '服务器已停止'
        });
      }
    } catch (error) {
      elements.stopServerBtn.disabled = false;
      addLogMessage({
        timestamp: new Date().toLocaleTimeString(),
        message: `停止服务器发生错误: ${error.message}`
      });
      console.error('停止服务器错误:', error);
    }
  }
  
  // 清除所有报警
  async function clearAllAlarms() {
    try {
      // 清除报警寄存器地址 (40002-40005, 40009)
      const alarmAddresses = [1, 2, 3, 4, 8];
      
      for (const addr of alarmAddresses) {
        await window.api.writeRegister('holding', addr, 0);
      }
      
      addLogMessage({
        timestamp: new Date().toLocaleTimeString(),
        message: '已清除所有报警状态'
      });
    } catch (error) {
      addLogMessage({
        timestamp: new Date().toLocaleTimeString(),
        message: `清除报警失败: ${error.message}`
      });
      console.error('清除报警错误:', error);
    }
  }
  
  // 更新服务器状态显示
  function updateServerStatus(status) {
    if (!elements.serverStatus || !elements.startServerBtn || !elements.stopServerBtn || !elements.portInput) return;
    
    try {
      console.log('更新服务器状态:', status);
      
      elements.serverStatus.textContent = status === 'running' ? '运行中' : (status === 'error' ? '错误' : '已停止');
      elements.serverStatus.className = `status-badge badge-${status === 'running' ? 'running' : (status === 'error' ? 'error' : 'stopped')}`;
      
      // 更新按钮状态
      elements.startServerBtn.disabled = status === 'running';
      elements.stopServerBtn.disabled = status !== 'running';
      elements.portInput.disabled = status === 'running';
    } catch (error) {
      console.error('更新服务器状态显示失败:', error);
    }
  }
  
  // 更新网络接口信息
  async function updateNetworkInfo() {
    if (!elements.networkInfo) return;
    
    try {
      const interfaces = await window.api.getNetworkInterfaces();
      if (interfaces && interfaces.length > 0) {
        const ipAddresses = interfaces.map(inf => `${inf.name}: ${inf.address}`).join(' | ');
        elements.networkInfo.textContent = `本机IP: ${ipAddresses}`;
      } else {
        elements.networkInfo.textContent = '本机IP: 未知';
      }
    } catch (error) {
      console.error('获取网络接口信息失败:', error);
      elements.networkInfo.textContent = '本机IP: 错误';
    }
  }
  
  // 更新点表
  function updatePointTable() {
    if (!elements.pointTableBody) return;
    
    try {
      elements.pointTableBody.innerHTML = '';
      
      pointTableData.forEach(point => {
        const row = document.createElement('tr');
        
        // 地址
        const addrCell = document.createElement('td');
        addrCell.textContent = point.addr;
        row.appendChild(addrCell);
        
        // 实际地址
        const realAddrCell = document.createElement('td');
        realAddrCell.textContent = point.realAddr;
        row.appendChild(realAddrCell);
        
        // 名称
        const nameCell = document.createElement('td');
        nameCell.textContent = point.name;
        if (point.description) {
          const descSpan = document.createElement('span');
          descSpan.className = 'register-description';
          descSpan.textContent = point.description;
          nameCell.appendChild(document.createElement('br'));
          nameCell.appendChild(descSpan);
        }
        row.appendChild(nameCell);
        
        // 读写方式
        const accessCell = document.createElement('td');
        accessCell.textContent = point.access;
        row.appendChild(accessCell);
        
        // 当前值
        const valueCell = document.createElement('td');
        valueCell.className = 'register-value';
        valueCell.setAttribute('data-address', point.addr);
        
        const value = registerValues.holdingRegisters[point.addr];
        valueCell.textContent = formatValue(value);
        
        row.appendChild(valueCell);
        
        // 操作
        const actionCell = document.createElement('td');
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm btn-outline-primary';
        editBtn.innerHTML = '<i class="fas fa-edit"></i>';
        editBtn.onclick = () => editRegister('holding', point.addr, point.name);
        actionCell.appendChild(editBtn);
        row.appendChild(actionCell);
        
        elements.pointTableBody.appendChild(row);
      });
    } catch (error) {
      console.error('更新点表失败:', error);
    }
  }
  
  // 更新寄存器显示
  function updateRegistersDisplay() {
    try {
      // 更新保持寄存器
      updateRegisterTable('holding', elements.holdingTableBody);
      
      // 更新输入寄存器
      updateRegisterTable('input', elements.inputTableBody);
      
      // 更新线圈
      updateRegisterTable('coil', elements.coilsTableBody);
      
      // 更新离散输入
      updateRegisterTable('discrete', elements.discreteTableBody);
    } catch (error) {
      console.error('更新寄存器显示失败:', error);
    }
  }
  
  // 更新单个寄存器表
  function updateRegisterTable(type, tableBody) {
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    let values;
    let baseAddr;
    let isDiscrete = false;
    
    switch (type) {
      case 'holding':
        values = registerValues.holdingRegisters;
        baseAddr = 40001;
        break;
      case 'input':
        values = registerValues.inputRegisters;
        baseAddr = 30001;
        break;
      case 'coil':
        values = registerValues.coils;
        baseAddr = 1;
        isDiscrete = true;
        break;
      case 'discrete':
        values = registerValues.discreteInputs;
        baseAddr = 10001;
        isDiscrete = true;
        break;
      default:
        console.error('未知的寄存器类型:', type);
        return;
    }
    
    if (!values) {
      console.warn(`寄存器类型 ${type} 的值为空`);
      return;
    }
    
    // 显示最多100个寄存器
    const maxToShow = Math.min(values.length, 100);
    
    for (let i = 0; i < maxToShow; i++) {
      const row = document.createElement('tr');
      
      // 索引地址
      const indexCell = document.createElement('td');
      indexCell.textContent = i;
      row.appendChild(indexCell);
      
      // 实际地址
      const addrCell = document.createElement('td');
      addrCell.textContent = baseAddr + i;
      row.appendChild(addrCell);
      
      // 值
      const valueCell = document.createElement('td');
      valueCell.className = 'register-value';
      valueCell.setAttribute('data-address', i);
      valueCell.setAttribute('data-type', type);
      
      if (isDiscrete) {
        // 布尔值显示
        const badge = document.createElement('span');
        badge.className = `badge ${values[i] ? 'bg-success' : 'bg-danger'}`;
        badge.textContent = values[i] ? 'ON' : 'OFF';
        valueCell.appendChild(badge);
      } else {
        // 数值显示
        valueCell.textContent = formatValue(values[i]);
      }
      
      // 点击编辑值
      valueCell.onclick = () => {
        // 检查是否在点表中
        const pointInfo = type === 'holding' ? 
          pointTableData.find(p => p.addr === i) : null;
        
        const name = pointInfo ? pointInfo.name : `${getRegisterTypeName(type)} ${i}`;
        editRegister(type, i, name);
      };
      
      row.appendChild(valueCell);
      tableBody.appendChild(row);
    }
  }
  
  // 编辑寄存器值
  function editRegister(type, address, name) {
    try {
      let value;
      switch (type) {
        case 'holding':
          value = registerValues.holdingRegisters[address];
          break;
        case 'input':
          value = registerValues.inputRegisters[address];
          break;
        case 'coil':
          value = registerValues.coils[address];
          break;
        case 'discrete':
          value = registerValues.discreteInputs[address];
          break;
      }
      
      // 使用模态对话框替代原生prompt
      const isDiscrete = type === 'coil' || type === 'discrete';
      
      // 获取模态对话框元素
      const modal = document.getElementById('edit-register-modal');
      const editAddressEl = document.getElementById('edit-address');
      const editNameEl = document.getElementById('edit-name');
      const editValueEl = document.getElementById('edit-value');
      const editTypeEl = document.getElementById('edit-type');
      const editRealAddressEl = document.getElementById('edit-real-address');
      const bitEditorEl = document.getElementById('bit-editor');
      const bitEditorContainerEl = document.getElementById('bit-editor-container');
      const saveRegisterBtn = document.getElementById('save-register-btn');
      
      if (!modal || !editAddressEl || !editNameEl || !editValueEl || !editTypeEl || !saveRegisterBtn) {
        console.error('找不到模态对话框元素');
        return;
      }
      
      // 设置模态对话框内容
      editAddressEl.value = address;
      editNameEl.value = name;
      editValueEl.value = value;
      editTypeEl.value = type;
      
      // 计算实际地址
      let realAddress = address;
      switch (type) {
        case 'holding': realAddress += 40001; break;
        case 'input': realAddress += 30001; break;
        case 'coil': realAddress += 1; break;
        case 'discrete': realAddress += 10001; break;
      }
      
      if (editRealAddressEl) {
        editRealAddressEl.value = realAddress;
      }
      
      // 如果是位值（线圈或离散输入），显示位编辑器
      if (bitEditorEl && bitEditorContainerEl && isDiscrete) {
        bitEditorEl.style.display = 'block';
        bitEditorContainerEl.innerHTML = '';
        
        const bitValue = document.createElement('div');
        bitValue.className = `bit-value ${value ? 'active' : 'inactive'}`;
        bitValue.textContent = value ? '1' : '0';
        bitValue.onclick = () => {
          const newValue = bitValue.textContent === '0';
          bitValue.textContent = newValue ? '1' : '0';
          bitValue.className = `bit-value ${newValue ? 'active' : 'inactive'}`;
          editValueEl.value = newValue ? '1' : '0';
        };
        
        bitEditorContainerEl.appendChild(bitValue);
      } else if (bitEditorEl) {
        bitEditorEl.style.display = 'none';
      }
      
      // 显示模态对话框
      const modalInstance = new bootstrap.Modal(modal);
      modalInstance.show();
      
      // 设置保存按钮点击事件
      const saveHandler = async () => {
        // 移除事件监听器，避免多次绑定
        saveRegisterBtn.removeEventListener('click', saveHandler);
        
        const newValue = isDiscrete 
          ? editValueEl.value === '1' || editValueEl.value.toLowerCase() === 'true'
          : parseInt(editValueEl.value);
        
        if (!isDiscrete && isNaN(newValue)) {
          alert('请输入有效数字');
          return;
        }
        
        try {
          // 关闭模态对话框
          modalInstance.hide();
          
          // 更新寄存器值
          const result = await window.api.writeRegister(type, address, newValue);
          
          if (result && result.success) {
            addLogMessage({
              timestamp: new Date().toLocaleTimeString(),
              message: `已将 ${name} 的值修改为 ${newValue}`
            });
          } else {
            addLogMessage({
              timestamp: new Date().toLocaleTimeString(),
              message: `修改 ${name} 的值失败: ${result ? result.message : '未知错误'}`
            });
          }
        } catch (error) {
          addLogMessage({
            timestamp: new Date().toLocaleTimeString(),
            message: `修改 ${name} 的值时发生错误: ${error.message}`
          });
        }
      };
      
      // 绑定保存事件
      saveRegisterBtn.addEventListener('click', saveHandler);
      
    } catch (error) {
      console.error('编辑寄存器失败:', error);
      alert(`编辑寄存器失败: ${error.message}`);
    }
  }
  
  // 处理寄存器变化
  function handleRegisterChanges(changes) {
    if (!changes || !Array.isArray(changes)) return;
    
    try {
      // 将新变化添加到历史记录
      registerHistory = [...changes, ...registerHistory];
      // 限制历史记录大小
      if (registerHistory.length > 1000) {
        registerHistory = registerHistory.slice(0, 1000);
      }
      
      // 更新历史表格
      updateHistoryTable();
      
      // 更新点表中对应的值
      changes.forEach(change => {
        const cells = document.querySelectorAll(`.register-value[data-address="${change.address}"]`);
        cells.forEach(cell => {
          // 检查是否是相应类型的寄存器单元格
          const cellType = cell.getAttribute('data-type');
          if (!cellType || cellType === 'holding') {
            // 更新显示的值
            if (typeof change.newValue === 'boolean') {
              const badge = cell.querySelector('span.badge');
              if (badge) {
                badge.className = `badge ${change.newValue ? 'bg-success' : 'bg-danger'}`;
                badge.textContent = change.newValue ? 'ON' : 'OFF';
              } else {
                cell.textContent = change.newValue ? '1' : '0';
              }
            } else {
              cell.textContent = formatValue(change.newValue);
            }
            
            // 添加高亮效果
            cell.classList.remove('highlight');
            void cell.offsetWidth; // 触发重绘
            cell.classList.add('highlight');
          }
        });
      });
    } catch (error) {
      console.error('处理寄存器变化失败:', error);
    }
  }
  
  // 更新历史表格
  function updateHistoryTable() {
    if (!elements.historyTableBody) return;
    
    try {
      elements.historyTableBody.innerHTML = '';
      
      // 显示最多100条记录
      const recordsToShow = registerHistory.slice(0, 100);
      
      recordsToShow.forEach(record => {
        const row = document.createElement('tr');
        
        // 时间
        const timeCell = document.createElement('td');
        timeCell.textContent = new Date(record.timestamp).toLocaleTimeString();
        row.appendChild(timeCell);
        
        // 地址
        const addrCell = document.createElement('td');
        addrCell.textContent = `${record.realAddress} (${record.address})`;
        row.appendChild(addrCell);
        
        // 名称
        const nameCell = document.createElement('td');
        nameCell.textContent = record.name;
        row.appendChild(nameCell);
        
        // 旧值
        const oldValueCell = document.createElement('td');
        oldValueCell.textContent = formatValue(record.oldValue);
        row.appendChild(oldValueCell);
        
        // 新值
        const newValueCell = document.createElement('td');
        newValueCell.textContent = formatValue(record.newValue);
        row.appendChild(newValueCell);
        
        elements.historyTableBody.appendChild(row);
      });
    } catch (error) {
      console.error('更新历史表格失败:', error);
    }
  }
  
  // 添加日志消息
  function addLogMessage(message) {
    if (!elements.logContainer) return;
    
    try {
      const logEntry = document.createElement('div');
      logEntry.className = 'log-message';
      
      // 时间戳
      const timestamp = document.createElement('span');
      timestamp.className = 'log-info';
      timestamp.textContent = `[${message.timestamp || new Date().toLocaleTimeString()}] `;
      
      // 消息内容
      const content = document.createElement('span');
      if (message.message.includes('错误') || message.message.includes('失败')) {
        content.className = 'log-error';
      } else if (message.message.includes('成功')) {
        content.className = 'log-success';
      }
      content.textContent = message.message;
      
      logEntry.appendChild(timestamp);
      logEntry.appendChild(content);
      elements.logContainer.appendChild(logEntry);
      
      // 自动滚动到底部
      if (!elements.autoScrollCheck || elements.autoScrollCheck.checked) {
        elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
      }
    } catch (error) {
      console.error('添加日志消息失败:', error);
    }
  }
  
  // 初始化图表
  function initChart() {
    if (!elements.registerChart) return;
    
    try {
      // 确保Chart.js已加载
      if (typeof Chart === 'undefined') {
        console.error('Chart.js 未加载，无法初始化图表');
        return;
      }
      
      const ctx = elements.registerChart.getContext('2d');
      
      registersChart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 0 // 禁用动画以提高性能
          },
          scales: {
            y: {
              beginAtZero: false
            },
            x: {
              display: true
            }
          }
        }
      });
      
      // 填充选择器
      if (elements.chartRegisterSelect) {
        elements.chartRegisterSelect.innerHTML = '';
        
        pointTableData.forEach(point => {
          const option = document.createElement('option');
          option.value = point.addr;
          option.textContent = `${point.realAddr} (${point.name})`;
          elements.chartRegisterSelect.appendChild(option);
        });
        
        // 添加图表更新事件
        elements.chartRegisterSelect.addEventListener('change', updateChartDatasets);
      }
    } catch (error) {
      console.error('初始化图表失败:', error);
    }
  }
  
  // 更新图表数据集
  function updateChartDatasets() {
    if (!registersChart || !elements.chartRegisterSelect) return;
    
    try {
      // 获取选中的寄存器
      const selectedOptions = Array.from(elements.chartRegisterSelect.selectedOptions);
      const selectedRegisters = selectedOptions.map(option => parseInt(option.value));
      
      // 清除现有数据集
      chartData.datasets = [];
      
      // 为每个选中的寄存器创建数据集
      selectedRegisters.forEach((addr, index) => {
        const pointInfo = pointTableData.find(p => p.addr === addr);
        const name = pointInfo ? pointInfo.name : `寄存器 ${addr}`;
        
        chartData.datasets.push({
          label: name,
          borderColor: chartColors[index % chartColors.length],
          backgroundColor: 'rgba(0, 0, 0, 0)',
          borderWidth: 2,
          data: Array(chartData.labels.length).fill(null),
          id: addr.toString()
        });
      });
      
      // 更新图表
      registersChart.update();
    } catch (error) {
      console.error('更新图表数据集失败:', error);
    }
  }
  
  // 更新图表数据
  function updateChartData() {
    if (!registersChart) return;
    
    try {
      // 添加时间标签
      const now = new Date();
      const timeStr = now.toLocaleTimeString();
      
      chartData.labels.push(timeStr);
      
      // 限制数据点数量
      const maxPoints = 20;
      if (chartData.labels.length > maxPoints) {
        chartData.labels.shift();
        chartData.datasets.forEach(dataset => {
          dataset.data.shift();
        });
      }
      
      // 更新各数据集的值
      chartData.datasets.forEach(dataset => {
        const addr = parseInt(dataset.id);
        dataset.data.push(registerValues.holdingRegisters[addr]);
      });
      
      // 更新图表
      registersChart.update();
    } catch (error) {
      console.error('更新图表数据失败:', error);
    }
  }
  
  // 格式化值显示
  function formatValue(value) {
    if (value === undefined || value === null) return '---';
    
    try {
      if (typeof value === 'boolean') {
        return value ? '1' : '0';
      }
      
      return DISPLAY_FORMATS[currentDisplayFormat](value);
    } catch (error) {
      console.error('格式化值失败:', error, value);
      return String(value);
    }
  }
  
  // 获取寄存器类型名称
  function getRegisterTypeName(type) {
    switch (type) {
      case 'holding': return '保持寄存器';
      case 'input': return '输入寄存器';
      case 'coil': return '线圈';
      case 'discrete': return '离散输入';
      default: return '未知类型';
    }
  }
  
  // 显示Python测试脚本生成器
  function showPythonGenerator() {
    try {
      // 获取模态框元素
      const modal = document.getElementById('python-modal');
      const checkboxesContainer = document.getElementById('python-register-checkboxes');
      const ipInput = document.getElementById('python-ip');
      const portInput = document.getElementById('python-port');
      const codeContainer = document.getElementById('python-code-container');
      const codeOutput = document.getElementById('python-code');
      const generateBtn = document.getElementById('generate-python-code-btn');
      const saveBtn = document.getElementById('save-python-btn');
      
      if (!modal || !checkboxesContainer || !ipInput || !portInput || !generateBtn) {
        console.error('找不到Python生成器模态框元素');
        return;
      }
      
      // 清空之前的内容
      checkboxesContainer.innerHTML = '';
      codeOutput.textContent = '';
      codeContainer.style.display = 'none';
      saveBtn.style.display = 'none';
      
      // 从网络接口信息获取IP地址
      updatePythonIpAddress(ipInput);
      
      // 设置默认端口
      portInput.value = elements.portInput ? elements.portInput.value : '502';
      
      // 创建寄存器选择项
      pointTableData.forEach(point => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'form-check';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'form-check-input';
        checkbox.id = `python-reg-${point.addr}`;
        checkbox.value = point.addr;
        
        // 默认选中煤量(0)、跑偏(1)、大块(2)、烟雾(3)
        if (point.addr >= 0 && point.addr <= 3) {
          checkbox.checked = true;
        }
        
        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.htmlFor = `python-reg-${point.addr}`;
        label.textContent = `${point.realAddr} (${point.name})`;
        
        checkboxDiv.appendChild(checkbox);
        checkboxDiv.appendChild(label);
        checkboxesContainer.appendChild(checkboxDiv);
      });
      
      // 生成代码按钮点击事件
      generateBtn.onclick = generatePythonCode;
      
      // 保存按钮点击事件
      if (saveBtn) {
        saveBtn.onclick = savePythonScript;
      }
      
      // 显示模态框
      const modalInstance = new bootstrap.Modal(modal);
      modalInstance.show();
    } catch (error) {
      console.error('显示Python生成器失败:', error);
      alert('显示Python生成器失败: ' + error.message);
    }
  }
  
  // 更新Python生成器中的IP地址
  async function updatePythonIpAddress(ipInput) {
    if (!ipInput) return;
    
    try {
      const interfaces = await window.api.getNetworkInterfaces();
      if (interfaces && interfaces.length > 0) {
        // 默认使用第一个网络接口的IP地址
        ipInput.value = interfaces[0].address;
      } else {
        ipInput.value = '127.0.0.1';
      }
    } catch (error) {
      console.error('获取网络接口信息失败:', error);
      ipInput.value = '127.0.0.1';
    }
  }
  
  // 生成Python测试代码
  async function generatePythonCode() {
    try {
      const checkboxes = document.querySelectorAll('#python-register-checkboxes input[type="checkbox"]:checked');
      const ipInput = document.getElementById('python-ip');
      const portInput = document.getElementById('python-port');
      const codeContainer = document.getElementById('python-code-container');
      const codeOutput = document.getElementById('python-code');
      const saveBtn = document.getElementById('save-python-btn');
      
      if (!checkboxes.length) {
        alert('请至少选择一个寄存器');
        return;
      }
      
      if (!ipInput || !portInput || !codeOutput) {
        console.error('找不到必要的DOM元素');
        return;
      }
      
      const addresses = Array.from(checkboxes).map(cb => parseInt(cb.value));
      const ip = ipInput.value;
      const port = parseInt(portInput.value);
      
      if (!ip) {
        alert('请输入有效的IP地址');
        return;
      }
      
      if (isNaN(port) || port < 1 || port > 65535) {
        alert('请输入有效的端口号(1-65535)');
        return;
      }
      
      // 调用API生成Python测试代码
      const result = await window.api.generatePythonTest({
        addresses,
        ip,
        port
      });
      
      if (result && result.success) {
        // 显示生成的代码
        codeOutput.textContent = result.code;
        codeContainer.style.display = 'block';
        
        // 显示保存按钮
        if (saveBtn) {
          saveBtn.style.display = 'block';
        }
        
        addLogMessage({
          timestamp: new Date().toLocaleTimeString(),
          message: '已生成Python测试脚本'
        });
      } else {
        alert('生成Python测试脚本失败: ' + (result ? result.message : '未知错误'));
      }
    } catch (error) {
      console.error('生成Python测试代码失败:', error);
      alert('生成Python测试代码失败: ' + error.message);
    }
  }
  
  // 保存Python脚本
  function savePythonScript() {
    try {
      const codeOutput = document.getElementById('python-code');
      if (!codeOutput || !codeOutput.textContent) {
        alert('没有可保存的Python代码');
        return;
      }
      
      // 创建下载链接
      const blob = new Blob([codeOutput.textContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modbus_test.py';
      a.click();
      
      // 释放URL
      URL.revokeObjectURL(url);
      
      addLogMessage({
        timestamp: new Date().toLocaleTimeString(),
        message: '已保存Python测试脚本'
      });
    } catch (error) {
      console.error('保存Python脚本失败:', error);
      alert('保存Python脚本失败: ' + error.message);
    }
  }
  
  // 导出历史记录为CSV
  function exportHistoryToCsv() {
    try {
      // 检查是否有历史记录数据
      if (!registerHistory || registerHistory.length === 0) {
        alert('没有可导出的历史记录数据');
        console.warn('导出CSV失败：没有可导出的历史记录数据');
        return;
      }
      
      console.log('开始导出CSV，记录数:', registerHistory.length);
      
      // 准备CSV内容
      let csvContent = '时间,实际地址,内部地址,名称,旧值,新值\n';
      
      // 添加所有记录
      registerHistory.forEach(record => {
        const timestamp = new Date(record.timestamp).toLocaleString();
        const realAddress = record.realAddress;
        const address = record.address;
        const name = record.name;
        const oldValue = record.oldValue;
        const newValue = record.newValue;
        
        // 将值转换为CSV行，处理可能包含逗号的文本
        const row = [
          `"${timestamp}"`,
          realAddress,
          address,
          `"${name}"`,
          oldValue,
          newValue
        ].join(',');
        
        csvContent += row + '\n';
      });
      
      // 创建Blob对象
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      // 文件名包含日期和时间
      const now = new Date();
      const fileName = `寄存器历史记录_${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}.csv`;
      
      // 创建下载链接
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      
      // 添加到文档并触发点击
      document.body.appendChild(link);
      link.click();
      
      // 清理
      document.body.removeChild(link);
      setTimeout(() => {
        URL.revokeObjectURL(url);
        console.log('CSV导出完成，已清理资源');
      }, 100);
      
      addLogMessage({
        timestamp: new Date().toLocaleTimeString(),
        message: `已导出历史记录数据为CSV文件：${fileName}`
      });
      
      console.log('导出CSV成功，文件名:', fileName);
    } catch (error) {
      console.error('导出CSV失败:', error);
      alert(`导出CSV失败: ${error.message}`);
      
      addLogMessage({
        timestamp: new Date().toLocaleTimeString(),
        message: `导出CSV失败: ${error.message}`
      });
    }
  }
  
  // 刷新寄存器数据
  async function refreshRegistersData() {
    try {
      // 获取当前服务器状态，确保服务器正在运行
      const status = await window.api.getServerStatus();
      if (status !== 'running') {
        addLogMessage({
          timestamp: new Date().toLocaleTimeString(),
          message: '警告: 服务器未运行，无法刷新数据。'
        });
        return;
      }
  
      // 显示刷新按钮正在刷新的状态
      const refreshBtn = document.getElementById('refresh-data-btn');
      if (refreshBtn) {
        const originalText = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>正在刷新...';
        refreshBtn.disabled = true;
  
        // 获取最新的寄存器数据
        try {
          const registers = await window.api.getRegisters();
          if (registers) {
            registerValues = registers;
            updateRegistersDisplay();
            updatePointTable();
            
            addLogMessage({
              timestamp: new Date().toLocaleTimeString(),
              message: '已成功刷新寄存器数据'
            });
          } else {
            addLogMessage({
              timestamp: new Date().toLocaleTimeString(),
              message: '刷新数据失败: 无法获取寄存器数据'
            });
          }
        } catch (error) {
          addLogMessage({
            timestamp: new Date().toLocaleTimeString(),
            message: `刷新数据失败: ${error.message}`
          });
          console.error('刷新数据错误:', error);
        } finally {
          // 恢复按钮状态
          refreshBtn.innerHTML = originalText;
          refreshBtn.disabled = false;
        }
      }
    } catch (error) {
      console.error('刷新寄存器数据失败:', error);
      addLogMessage({
        timestamp: new Date().toLocaleTimeString(),
        message: `刷新数据失败: ${error.message}`
      });
    }
  }