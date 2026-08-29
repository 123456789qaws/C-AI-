/**
 * Luna-for-C Demo - Mock Data
 * 所有后端行为在此文件中模拟，无需真实后端
 */

const MockData = {
  // 任务数据
  task: {
    id: 'fib_L2',
    title: '递归求解 Fibonacci 数列',
    description: '实现递归函数 fib(n)，返回第 n 个 Fibonacci 数',
    language: 'c',
    lockedRanges: [
      { startLine: 12, endLine: 20, gateId: 'cp1' },
      { startLine: 22, endLine: 40, gateId: 'cp2' }
    ],
    checkpoints: [
      {
        id: 'cp1',
        title: '递归终止条件',
        type: 'ai_socratic',
        status: 'current',
        guideQuestion: '先告诉我：fib(0) 和 fib(1) 应该返回什么？n 为负时呢？',
        passRuleHint: '你的回答需要包含 n<=1 的处理逻辑',
        passThreshold: 0.6
      },
      {
        id: 'cp2',
        title: '通过隐藏测试',
        type: 'test_pass',
        status: 'locked',
        guideQuestion: '完成递归实现，确保所有测试用例通过',
        passRuleHint: '需要包含 return n 和 fib(n-1) + fib(n-2)'
      }
    ],
    templateCode: `// Fibonacci 递归实现
#include <stdio.h>

int fib(int n) {
    // TODO: 实现递归求解
    
}

int main() {
    int n;
    scanf("%d", &n);
    printf("%d\\n", fib(n));
    return 0;
}`,
    hints: [
      'Fibonacci 数列：F(0)=0, F(1)=1, F(n)=F(n-1)+F(n-2)',
      '递归必须有终止条件，否则会栈溢出',
      '考虑 n<0 的边界情况'
    ]
  },

  // 模拟 AI Socratic 回复
  aiSocraticReplies: {
    // 代码中缺少 n<=1 判断
    missingTermination: {
      reply: '先告诉我：fib(0) 和 fib(1) 应该返回什么？n 为负时呢？',
      confidence: 0.85,
      escalate: false
    },
    // 代码中包含 n<=1
    hasTermination: {
      reply: '很好！那 n<0 时你打算返回什么？已解锁下一区域',
      confidence: 0.85,
      escalate: false,
      unlockNext: true
    },
    // 用户请求完整代码
    askForCode: {
      reply: '我不能直接给整段，请先回答终止条件',
      confidence: 0.9,
      escalate: false
    },
    // 段错误模拟：包含 *p = 1 但没有 malloc
    segmentationFault: {
      reply: '在 *p 前后打印 p 地址，哪一行是 0x0？',
      confidence: 0.85,
      escalate: false
    },
    // 通用回复
    generic: {
      reply: '继续思考，递归的关键是终止条件和递推关系。',
      confidence: 0.7,
      escalate: false
    }
  },

  // 模拟验证结果
  verificationResults: {
    pass: {
      status: 'passed',
      message: '验证通过！',
      score: 1.0,
      details: '代码包含正确的终止条件'
    },
    fail: {
      status: 'failed',
      message: '验证失败',
      score: 0.3,
      details: '代码缺少必要的终止条件判断'
    },
    escalate: {
      status: 'escalated',
      message: '需要人工审核',
      score: 0.5,
      details: '系统无法自动判断，请等待教师审核'
    }
  },

  // 模拟测试用例
  testCases: [
    { input: '0', expected: '0', description: 'fib(0) = 0' },
    { input: '1', expected: '1', description: 'fib(1) = 1' },
    { input: '5', expected: '5', description: 'fib(5) = 5' },
    { input: '10', expected: '55', description: 'fib(10) = 55' },
    { input: '15', expected: '610', description: 'fib(15) = 610' }
  ],

  // 模拟 GCC 编译结果
  gccResults: {
    success: {
      status: 'success',
      output: '',
      errors: ''
    },
    compileError: {
      status: 'error',
      output: '',
      errors: 'error: expected \';\' before \'}\' token'
    },
    runtimeError: {
      status: 'runtime_error',
      output: '',
      errors: 'Segmentation fault (core dumped)'
    }
  },

  // 模拟代码执行结果
  executionResults: {
    ac: (output, expected) => ({
      status: 'AC',
      message: '答案正确',
      output: output,
      expected: expected,
      executionTime: '12ms',
      memoryUsage: '1.2MB'
    }),
    wa: (output, expected) => ({
      status: 'WA',
      message: '答案错误',
      output: output,
      expected: expected,
      executionTime: '15ms',
      memoryUsage: '1.2MB'
    }),
    re: (error) => ({
      status: 'RE',
      message: '运行时错误',
      error: error,
      executionTime: '8ms',
      memoryUsage: '0.8MB'
    }),
    tle: () => ({
      status: 'TLE',
      message: '超时',
      executionTime: '1000ms',
      memoryUsage: '100MB'
    })
  },

  // 教师视角数据
  teacherView: {
    hiddenTests: [
      { input: '0', expected: '0' },
      { input: '1', expected: '1' },
      { input: '5', expected: '5' },
      { input: '10', expected: '55' },
      { input: '15', expected: '610' },
      { input: '20', expected: '6765' },
      { input: '30', expected: '832040' }
    ],
    allCheckpoints: ['cp1', 'cp2'],
    studentProgress: {
      cp1: { attempts: 0, status: 'current' },
      cp2: { attempts: 0, status: 'locked' }
    }
  },

  // Toast 消息模板
  toasts: {
    verifySuccess: {
      type: 'success',
      title: '验证通过',
      message: '你的回答符合要求，已解锁下一区域'
    },
    verifyFail: {
      type: 'error',
      title: '验证失败',
      message: '请检查你的回答后重试'
    },
    verifyEscalated: {
      type: 'warning',
      title: '需要审核',
      message: '已提交给教师审核'
    },
    checkpointPassed: {
      type: 'success',
      title: '检查点通过',
      message: '恭喜！你已通过此检查点'
    },
    allPassed: {
      type: 'success',
      title: '全部完成',
      message: '所有检查点已通过，可以提交作业了'
    },
    resetSuccess: {
      type: 'info',
      title: '已重置',
      message: '所有进度已重置'
    },
    error: {
      type: 'error',
      title: '错误',
      message: '操作失败，请重试'
    }
  },

  // 模拟网络延迟（毫秒）
  delays: {
    aiReply: 500,
    verification: 300,
    compilation: 800,
    execution: 200
  }
};

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MockData;
}
