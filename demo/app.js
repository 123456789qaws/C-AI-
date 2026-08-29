/**
 * Luna-for-C Demo - 核心应用逻辑
 * 纯前端实现，无后端依赖
 */

// 全局状态
const AppState = {
  editor: null,
  task: null,
  checkpoints: [],
  currentCheckpoint: null,
  chatMessages: [],
  isTeacherView: false,
  lockedDecorations: [],
  lockRanges: [],
  teacherPrevCode: null
};

// 初始化应用
function initApp() {
  console.log('Luna-for-C Demo 初始化...');
  
  // 加载任务数据
  loadTaskData();
  
  // 初始化 Monaco 编辑器
  initMonacoEditor();
  
  // 渲染检查点列表
  renderCheckpoints();
  
  // 初始化聊天面板
  initChatPanel();
  
  // 绑定事件
  bindEvents();
  
  console.log('初始化完成');
}

// 加载任务数据
function loadTaskData() {
  AppState.task = MockData.task;
  AppState.checkpoints = [...MockData.task.checkpoints];
  AppState.lockRanges = [...MockData.task.lockedRanges];
  AppState.currentCheckpoint = AppState.checkpoints.find(cp => cp.status === 'current');
  
  // 更新任务标题
  document.getElementById('task-title').textContent = AppState.task.title;
}

// 初始化 Monaco 编辑器
function initMonacoEditor() {
  require.config({ 
    paths: { 
      vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs' 
    } 
  });
  
  require(['vs/editor/editor.main'], function () {
    // 创建编辑器
    AppState.editor = monaco.editor.create(document.getElementById('monaco-editor'), {
      value: AppState.task.templateCode,
      language: 'c',
      theme: 'vs-dark',
      minimap: { enabled: false },
      fontSize: 14,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 4,
      insertSpaces: true,
      wordWrap: 'on',
      readOnly: false,
      renderLineHighlight: 'all',
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8
      }
    });
    
    // 设置锁定区域
    updateLockedRegions();
    
    // 监听内容变化
    AppState.editor.onDidChangeModelContent((e) => {
      handleEditorChange(e);
    });
    
    console.log('Monaco 编辑器初始化完成');
  });
}

// 更新锁定区域
function updateLockedRegions() {
  if (!AppState.editor) return;
  
  // 清除之前的装饰
  AppState.editor.deltaDecorations(AppState.lockedDecorations, []);
  
  // 如果是教师视角，不显示锁定
  if (AppState.isTeacherView) {
    AppState.lockedDecorations = [];
    return;
  }
  
  const decorations = [];
  const model = AppState.editor.getModel();
  
  AppState.lockRanges.forEach(range => {
    const checkpoint = AppState.checkpoints.find(cp => cp.id === range.gateId);
    if (checkpoint && checkpoint.status === 'locked') {
      // 添加锁定区域装饰
      for (let line = range.startLine; line <= range.endLine; line++) {
        decorations.push({
          range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
          options: {
            isWholeLine: true,
            className: 'locked-line',
            glyphMarginClassName: 'lock-icon-glyph',
            glyphMarginHoverMessage: { value: `🔒 此区域需要通过 ${checkpoint.title} 后解锁` },
            overviewRuler: {
              color: '#737373',
              position: monaco.editor.OverviewRulerLane.Right
            }
          }
        });
      }
    }
  });
  
  AppState.lockedDecorations = AppState.editor.deltaDecorations([], decorations);
}

// 处理编辑器内容变化
function handleEditorChange(e) {
  if (AppState.isTeacherView) return;
  
  const model = AppState.editor.getModel();
  
  // 检查是否有锁定区域被修改
  for (const change of e.changes) {
    const changedRange = change.range;
    
    for (const lockRange of AppState.lockRanges) {
      const checkpoint = AppState.checkpoints.find(cp => cp.id === lockRange.gateId);
      if (checkpoint && checkpoint.status === 'locked') {
        // 检查是否与锁定区域重叠
        if (changedRange.startLineNumber <= lockRange.endLine && 
            changedRange.endLineNumber >= lockRange.startLine) {
          // 回滚修改
          const originalCode = getLockedRegionCode(lockRange);
          AppState.editor.executeEdits('lock-rollback', [{
            range: new monaco.Range(
              lockRange.startLine, 1, 
              lockRange.endLine, model.getLineMaxColumn(lockRange.endLine)
            ),
            text: originalCode
          }]);
          
          showToast('warning', '区域锁定', '此区域需要通过检查点后才能编辑');
          return;
        }
      }
    }
  }
}

// 获取锁定区域的原始代码
function getLockedRegionCode(range) {
  const lines = AppState.task.templateCode.split('\n');
  const regionLines = [];
  
  for (let i = range.startLine - 1; i < range.endLine && i < lines.length; i++) {
    regionLines.push(lines[i]);
  }
  
  return regionLines.join('\n');
}

// 渲染检查点列表
function renderCheckpoints() {
  const container = document.getElementById('checkpoints-list');
  container.innerHTML = '';
  
  AppState.checkpoints.forEach((cp, index) => {
    const card = createCheckpointCard(cp, index);
    container.appendChild(card);
  });
  
  // 更新进度点
  updateProgressDots();
}

// 创建检查点卡片
function createCheckpointCard(checkpoint, index) {
  const card = document.createElement('div');
  card.className = `checkpoint-card ${checkpoint.status}`;
  card.dataset.id = checkpoint.id;
  
  // 状态图标
  let statusIcon = '';
  if (checkpoint.status === 'locked') {
    statusIcon = '🔒';
  } else if (checkpoint.status === 'current') {
    statusIcon = String(index + 1);
  } else {
    statusIcon = '✓';
  }
  
  // 类型标签
  const typeLabel = checkpoint.type === 'ai_socratic' ? 'AI 对话' : '测试通过';
  const typeBadge = checkpoint.type === 'ai_socratic' ? 'badge-orange' : 'badge-blue';
  
  card.innerHTML = `
    <div class="checkpoint-header">
      <div class="checkpoint-status ${checkpoint.status}">${statusIcon}</div>
      <div class="checkpoint-title">${checkpoint.title}</div>
      <span class="badge ${typeBadge}">${typeLabel}</span>
    </div>
    <div class="checkpoint-guide">
      <div style="margin-bottom: 4px;"><strong>引导问题：</strong>${checkpoint.guideQuestion}</div>
      <div><strong>通过规则：</strong>${checkpoint.passRuleHint}</div>
    </div>
  `;
  
  // 点击事件
  card.addEventListener('click', () => {
    selectCheckpoint(checkpoint);
  });
  
  return card;
}

// 选择检查点
function selectCheckpoint(checkpoint) {
  if (checkpoint.status === 'locked') {
    showToast('warning', '检查点锁定', '请先通过前面的检查点');
    return;
  }
  
  AppState.currentCheckpoint = checkpoint;
  
  // 更新 UI
  document.querySelectorAll('.checkpoint-card').forEach(card => {
    card.classList.remove('selected');
  });
  document.querySelector(`.checkpoint-card[data-id="${checkpoint.id}"]`)?.classList.add('selected');
  
  // 如果是 AI Socratic 类型，显示引导问题
  if (checkpoint.type === 'ai_socratic') {
    addAIMessage(checkpoint.guideQuestion);
  }
}

// 初始化聊天面板
function initChatPanel() {
  // 添加欢迎消息
  addAIMessage('你好！我是 Luna，你的 C 语言学习助手。请先完成递归终止条件的思考。');
  
  // 绑定输入框事件
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const charCount = document.getElementById('char-count');
  
  input.addEventListener('input', () => {
    updateCharCount();
  });
  
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  sendBtn.addEventListener('click', sendMessage);
}

// 更新字符计数
function updateCharCount() {
  const input = document.getElementById('chat-input');
  const charCount = document.getElementById('char-count');
  const count = input.value.length;
  
  charCount.textContent = `${count}/500`;
  charCount.className = 'char-count';
  
  if (count > 450) {
    charCount.classList.add('warning');
  }
  if (count > 500) {
    charCount.classList.add('error');
  }
}

// 发送消息
function sendMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  
  if (!message) return;
  
  // 添加用户消息
  addUserMessage(message);
  
  // 清空输入框
  input.value = '';
  updateCharCount();
  
  // 模拟 AI 回复
  setTimeout(() => {
    const reply = generateAIReply(message);
    addAIMessage(reply);
  }, MockData.delays.aiReply);
}

// 添加用户消息
function addUserMessage(content) {
  const container = document.getElementById('chat-messages');
  const message = document.createElement('div');
  message.className = 'message user';
  message.innerHTML = `
    <div class="message-avatar">你</div>
    <div class="message-content">${escapeHtml(content)}</div>
  `;
  container.appendChild(message);
  container.scrollTop = container.scrollHeight;
  
  AppState.chatMessages.push({
    role: 'user',
    content: content,
    timestamp: new Date()
  });
}

// 添加 AI 消息
function addAIMessage(content) {
  const container = document.getElementById('chat-messages');
  const message = document.createElement('div');
  message.className = 'message ai';
  message.innerHTML = `
    <div class="message-avatar">🌙</div>
    <div class="message-content">${content}</div>
  `;
  container.appendChild(message);
  container.scrollTop = container.scrollHeight;
  
  AppState.chatMessages.push({
    role: 'ai',
    content: content,
    timestamp: new Date()
  });
}

// 生成 AI 回复
function generateAIReply(userMessage) {
  const code = AppState.editor?.getValue() || '';
  const lowerMessage = userMessage.toLowerCase();
  
  // 检查是否请求完整代码
  if (lowerMessage.includes('给我代码') || lowerMessage.includes('完整代码') || lowerMessage.includes('直接给')) {
    return MockData.aiSocraticReplies.askForCode.reply;
  }
  
  // 检查是否包含段错误相关
  if (code.includes('*p = 1') && !code.includes('malloc')) {
    return MockData.aiSocraticReplies.segmentationFault.reply;
  }
  
  // 检查是否包含终止条件
  if (code.includes('n <= 1') || code.includes('n<=1') || code.includes('n < 2') || code.includes('n<2')) {
    if (AppState.currentCheckpoint?.type === 'ai_socratic') {
      // 自动验证通过
      setTimeout(() => {
        verifyCheckpoint();
      }, 1000);
    }
    return MockData.aiSocraticReplies.hasTermination.reply;
  }
  
  // 检查用户回答是否包含关键信息
  if (lowerMessage.includes('0') && lowerMessage.includes('1') && 
      (lowerMessage.includes('返回') || lowerMessage.includes('return'))) {
    if (AppState.currentCheckpoint?.type === 'ai_socratic') {
      setTimeout(() => {
        verifyCheckpoint();
      }, 1000);
    }
    return MockData.aiSocraticReplies.hasTermination.reply;
  }
  
  // 默认回复
  if (AppState.currentCheckpoint?.status === 'current') {
    return MockData.aiSocraticReplies.missingTermination.reply;
  }
  
  return MockData.aiSocraticReplies.generic.reply;
}

// 验证检查点
function verifyCheckpoint() {
  if (!AppState.currentCheckpoint) {
    showToast('error', '错误', '请先选择一个检查点');
    return;
  }
  
  const code = AppState.editor?.getValue() || '';
  const userMessage = AppState.chatMessages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join(' ');
  
  let result;
  
  if (AppState.currentCheckpoint.type === 'ai_socratic') {
    result = evaluateSocraticCheckpoint(code, userMessage);
  } else if (AppState.currentCheckpoint.type === 'test_pass') {
    result = evaluateTestCheckpoint(code);
  }
  
  if (result.passed) {
    // 更新检查点状态
    AppState.currentCheckpoint.status = 'passed';
    
    // 解锁下一个检查点
    const nextCheckpoint = AppState.checkpoints.find(cp => cp.status === 'locked');
    if (nextCheckpoint) {
      nextCheckpoint.status = 'current';
    }
    
    // 更新编辑器锁定区域
    updateLockedRegions();
    
    // 渲染检查点列表
    renderCheckpoints();
    
    // 显示成功消息
    showToast('success', '验证通过', result.message);
    addAIMessage(result.aiMessage || '很好！你已通过此检查点。');
    
    // 检查是否全部通过
    checkAllPassed();
  } else {
    showToast('error', '验证失败', result.message);
    addAIMessage(result.aiMessage || '请检查你的回答后重试。');
  }
}

// 评估 Socratic 检查点
function evaluateSocraticCheckpoint(code, userMessage) {
  const gates = AppState.currentCheckpoint.gates || [];
  let totalScore = 0;
  let totalWeight = 0;
  
  gates.forEach(gate => {
    if (gate.type === 'regex') {
      // 正则表达式检查
      const regex = new RegExp(gate.rule, 'i');
      const passed = regex.test(code);
      totalScore += (passed ? 1 : 0) * gate.weight;
    } else if (gate.type === 'ai_socratic') {
      // AI Socratic 检查
      const hasTermination = /n\s*<=\s*1|n\s*<\s*2/i.test(code);
      const hasCompleteFib = /int\s+fib\s*\(/.test(code) && /return\s+fib/.test(code);
      
      let passed = false;
      if (gate.rubric.includes('含 n<=1') && gate.rubric.includes('不含完整 fib')) {
        passed = hasTermination && !hasCompleteFib;
      } else {
        passed = hasTermination;
      }
      
      totalScore += (passed ? 1 : 0) * gate.weight;
    }
    totalWeight += gate.weight;
  });
  
  const score = totalWeight > 0 ? totalScore / totalWeight : 0;
  const passed = score >= AppState.currentCheckpoint.passThreshold;
  
  return {
    passed,
    score,
    message: passed ? '你的回答符合要求！' : '请检查是否包含 n<=1 的判断，且不要写出完整函数。',
    aiMessage: passed ? 
      '很好！你已经理解了递归终止条件。已解锁下一区域。' : 
      '请再想想：fib(0) 和 fib(1) 应该返回什么？代码中需要怎样的判断？'
  };
}

// 评估测试检查点
function evaluateTestCheckpoint(code) {
  const gates = AppState.currentCheckpoint.gates || [];
  
  for (const gate of gates) {
    if (gate.type === 'test_pass') {
      // 模拟代码执行
      const testResults = runMockTests(code, gate.tests);
      const allPassed = testResults.every(r => r.status === 'AC');
      
      if (allPassed) {
        return {
          passed: true,
          message: '所有测试用例通过！',
          aiMessage: '恭喜！你的代码通过了所有隐藏测试。可以提交作业了。'
        };
      } else {
        const failedTest = testResults.find(r => r.status !== 'AC');
        return {
          passed: false,
          message: `测试用例 ${failedTest?.testId || ''} 未通过`,
          aiMessage: `测试未通过。请检查你的递归实现是否正确。提示：确保递归终止条件正确。`
        };
      }
    }
  }
  
  return {
    passed: false,
    message: '未找到有效的测试门控',
    aiMessage: '请先完成递归终止条件的思考。'
  };
}

// 运行模拟测试
function runMockTests(code, tests) {
  const results = [];
  
  // 模拟代码执行逻辑
  const hasCorrectTermination = /n\s*<=\s*1|n\s*<\s*2/i.test(code);
  const hasReturnN = /return\s+n/i.test(code);
  const hasRecursiveCall = /fib\s*\(\s*n\s*-\s*[12]\s*\)/i.test(code);
  const hasMain = /int\s+main\s*\(/i.test(code);
  
  // 简单的 Fibonacci 计算逻辑（仅用于演示）
  function mockFib(n) {
    if (n <= 1) return n;
    return mockFib(n - 1) + mockFib(n - 2);
  }
  
  tests.forEach((test, index) => {
    const input = parseInt(test.input);
    const expected = parseInt(test.expected);
    
    // 模拟执行结果
    let output;
    if (hasCorrectTermination && hasReturnN && hasRecursiveCall) {
      output = mockFib(input);
    } else if (hasCorrectTermination && hasReturnN) {
      // 没有递归调用，只返回 n
      output = input;
    } else {
      output = -1; // 错误输出
    }
    
    const status = output === expected ? 'AC' : 'WA';
    
    results.push({
      testId: `test_${index + 1}`,
      input: test.input,
      expected: test.expected,
      output: String(output),
      status,
      executionTime: `${Math.floor(Math.random() * 20) + 5}ms`,
      memoryUsage: `${(Math.random() * 2 + 0.5).toFixed(1)}MB`
    });
  });
  
  return results;
}

// 检查是否全部通过
function checkAllPassed() {
  const allPassed = AppState.checkpoints.every(cp => cp.status === 'passed');
  
  if (allPassed) {
    // 启用提交按钮
    document.getElementById('submit-btn').disabled = false;
    showToast('success', '全部完成', '所有检查点已通过，可以提交作业了');
    addAIMessage('🎉 恭喜！你已完成所有检查点，可以点击"提交作业"按钮了。');
  }
}

// 绑定事件
function bindEvents() {
  // 验证按钮
  document.getElementById('verify-btn').addEventListener('click', verifyCheckpoint);
  
  // 重置按钮
  document.getElementById('reset-btn').addEventListener('click', resetProgress);
  
  // 提交按钮
  document.getElementById('submit-btn').addEventListener('click', submitTask);
  
  // 教师视角切换
  document.getElementById('teacher-toggle').addEventListener('click', toggleTeacherView);
  
  // 提示按钮
  document.getElementById('hint-btn').addEventListener('click', showHint);
}

// 重置进度
function resetProgress() {
  AppState.checkpoints.forEach((cp, index) => {
    cp.status = index === 0 ? 'current' : 'locked';
  });
  
  AppState.currentCheckpoint = AppState.checkpoints[0];
  
  // 重置编辑器
  if (AppState.editor) {
    AppState.editor.setValue(AppState.task.templateCode);
  }
  
  // 更新锁定区域
  updateLockedRegions();
  
  // 渲染检查点
  renderCheckpoints();
  
  // 清空聊天
  document.getElementById('chat-messages').innerHTML = '';
  addAIMessage('进度已重置。请重新开始思考递归终止条件。');
  
  // 禁用提交按钮
  document.getElementById('submit-btn').disabled = true;
  
  showToast('info', '已重置', '所有进度已重置');
}

// 提交任务
function submitTask() {
  const allPassed = AppState.checkpoints.every(cp => cp.status === 'passed');
  
  if (!allPassed) {
    showToast('warning', '未完成', '请先完成所有检查点');
    return;
  }
  
  // 模拟提交
  showToast('success', '提交成功', '你的代码已提交，等待教师审核');
  addAIMessage('✅ 你的代码已成功提交！教师将进行审核。');
}

// 切换教师视角
function toggleTeacherView() {
  AppState.isTeacherView = !AppState.isTeacherView;
  
  const toggle = document.getElementById('teacher-toggle');
  const hiddenTestsPanel = document.getElementById('hidden-tests-panel');
  const lockStatus = document.getElementById('lock-status');
  
  if (AppState.isTeacherView) {
    // 保存当前学生代码，以便切回时恢复
    AppState.teacherPrevCode = AppState.editor.getValue();
    
    // 替换编辑器内容为完整参考答案
    const refCode = MockData.teacherView.referenceCode;
    if (refCode) {
      AppState.editor.setValue(refCode);
    }
    
    toggle.classList.add('active');
    hiddenTestsPanel.style.display = 'block';
    
    // 显示隐藏测试
    renderHiddenTests();
    
    // 移除锁定装饰
    updateLockedRegions();
    
    // 更新锁定状态文本
    if (lockStatus) {
      lockStatus.textContent = '🔓 教师模式：全部区域已解锁';
    }
    
    // 确保编辑器可编辑
    AppState.editor.updateOptions({ readOnly: false });
    
    showToast('info', '教师视角', '已切换到教师视角，可以查看所有内容');
  } else {
    // 恢复学生之前的代码（若无则回退到模板）
    const prevCode = AppState.teacherPrevCode || AppState.task.templateCode;
    AppState.editor.setValue(prevCode);
    AppState.teacherPrevCode = null;
    
    toggle.classList.remove('active');
    hiddenTestsPanel.style.display = 'none';
    
    // 恢复锁定装饰
    updateLockedRegions();
    
    // 恢复锁定状态文本
    if (lockStatus) {
      lockStatus.textContent = '🔒 编辑器部分区域已锁定';
    }
    
    showToast('info', '学生视角', '已切换回学生视角');
  }
}

// 渲染隐藏测试
function renderHiddenTests() {
  const container = document.getElementById('hidden-tests-list');
  container.innerHTML = '';
  
  MockData.teacherView.hiddenTests.forEach(test => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${test.input}</td>
      <td>${test.expected}</td>
    `;
    container.appendChild(row);
  });
}

// 显示提示
function showHint() {
  if (AppState.task.hints && AppState.task.hints.length > 0) {
    const randomHint = AppState.task.hints[Math.floor(Math.random() * AppState.task.hints.length)];
    addAIMessage(`💡 提示：${randomHint}`);
    showToast('info', '提示', '已显示一条提示');
  }
}

// Toast 通知
function showToast(type, title, message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '';
  switch (type) {
    case 'success':
      icon = '✓';
      break;
    case 'error':
      icon = '✗';
      break;
    case 'warning':
      icon = '⚠';
      break;
    case 'info':
      icon = 'ℹ';
      break;
  }
  
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;
  
  container.appendChild(toast);
  
  // 自动移除
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

// 更新进度点
function updateProgressDots() {
  const container = document.getElementById('progress-dots');
  container.innerHTML = '';
  
  AppState.checkpoints.forEach((cp, index) => {
    const dot = document.createElement('div');
    dot.className = `progress-dot ${cp.status}`;
    dot.title = cp.title;
    container.appendChild(dot);
  });
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);
