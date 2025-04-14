// debug.js - 调试脚本，用于检查环境和API状态

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM 已加载完成');
  
  // 检查API是否正确暴露
  if (window.api) {
    console.log('API 已成功暴露:', Object.keys(window.api));
    
    // 尝试从主进程获取服务器状态
    window.api.getServerStatus()
      .then(status => {
        console.log('服务器状态:', status);
      })
      .catch(err => {
        console.error('获取服务器状态错误:', err);
      });
  } else {
    console.error('API 未暴露 - window.api 是 undefined');
    
    // 显示错误信息到页面
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.style.padding = '10px';
    errorDiv.style.background = '#ffeeee';
    errorDiv.style.border = '1px solid red';
    errorDiv.style.margin = '10px';
    errorDiv.innerHTML = '<h3>加载错误</h3><p>preload.js 未能正确暴露 API</p>';
    document.body.prepend(errorDiv);
  }
  
  // 检查Bootstrap是否加载
  if (typeof bootstrap !== 'undefined') {
    console.log('Bootstrap 已成功加载');
  } else {
    console.error('Bootstrap 未能加载');
  }
  
  // 检查Chart.js是否加载
  if (typeof Chart !== 'undefined') {
    console.log('Chart.js 已成功加载');
  } else {
    console.error('Chart.js 未能加载');
  }
});