'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const MOCK_HEAT_DATA = [
  { taskId: 'task-1', taskName: 'Hello World', avgScore: 92, submissions: 45, passRate: 0.98 },
  { taskId: 'task-2', taskName: '变量与类型', avgScore: 85, submissions: 42, passRate: 0.93 },
  { taskId: 'task-3', taskName: '条件判断', avgScore: 78, submissions: 40, passRate: 0.85 },
  { taskId: 'task-4', taskName: '循环结构', avgScore: 72, submissions: 38, passRate: 0.79 },
  { taskId: 'task-5', taskName: '数组基础', avgScore: 68, submissions: 35, passRate: 0.71 },
  { taskId: 'task-6', taskName: '函数定义', avgScore: 65, submissions: 33, passRate: 0.67 },
  { taskId: 'task-7', taskName: '指针入门', avgScore: 58, submissions: 30, passRate: 0.57 },
  { taskId: 'task-8', taskName: '结构体', avgScore: 55, submissions: 28, passRate: 0.54 },
];

const MOCK_TIMELINE = [
  { time: '09:15', student: '张三', task: '指针入门', action: '提交代码', status: '通过' },
  { time: '09:18', student: '李四', task: '循环结构', action: '提交代码', status: '失败' },
  { time: '09:22', student: '王五', task: '数组基础', action: '提交代码', status: '通过' },
  { time: '09:25', student: '赵六', task: '函数定义', action: '开始编码', status: '进行中' },
  { time: '09:28', student: '钱七', task: '条件判断', action: '提交代码', status: '通过' },
  { time: '09:30', student: '孙八', task: 'Hello World', action: '提交代码', status: '通过' },
  { time: '09:33', student: '周九', task: '结构体', action: '开始编码', status: '进行中' },
  { time: '09:35', student: '吴十', task: '变量与类型', action: '提交代码', status: '通过' },
];

const MOCK_STATS = {
  totalStudents: 45,
  activeNow: 12,
  avgScore: 71.6,
  totalSubmissions: 291,
};

export default function TeacherDashboard() {
  const handleExportCSV = () => {
    const headers = ['任务ID', '任务名称', '平均分', '提交数', '通过率'];
    const rows = MOCK_HEAT_DATA.map((d) => [
      d.taskId,
      d.taskName,
      d.avgScore.toString(),
      d.submissions.toString(),
      `${(d.passRate * 100).toFixed(1)}%`,
    ]);
    const csvContent = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `teacher-dashboard-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const getHeatColor = (passRate: number) => {
    if (passRate >= 0.9) return 'bg-green-500';
    if (passRate >= 0.7) return 'bg-yellow-500';
    if (passRate >= 0.5) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Left Sidebar - Navigation */}
      <aside className="flex-shrink-0 w-64 border-r border-border bg-card hidden lg:block">
        <nav className="p-4 space-y-1" aria-label="教师看板导航">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            教师看板
          </div>
          <a
            href="#overview"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-primary bg-primary/10"
            aria-current="page"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            概览
          </a>
          <a
            href="#students"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            学生列表
          </a>
          <a
            href="#tasks"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            任务管理
          </a>
          <a
            href="#analytics"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            数据分析
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-y-auto bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">教师看板</h1>
              <p className="text-sm text-muted-foreground mt-1">
                实时监控学生学习进度与代码提交情况
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <svg
                  className="size-4 mr-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                导出 CSV
              </Button>
              <Button variant="secondary" size="sm">
                <svg
                  className="size-4 mr-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
                刷新
              </Button>
            </div>
          </header>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card size="sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">总学生数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{MOCK_STATS.totalStudents}</div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">在线人数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{MOCK_STATS.activeNow}</div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">平均分</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{MOCK_STATS.avgScore}</div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">总提交数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">
                  {MOCK_STATS.totalSubmissions}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Heat Map Section */}
          <section id="heatmap" aria-labelledby="heatmap-title">
            <div className="flex items-center justify-between mb-4">
              <h2 id="heatmap-title" className="text-lg font-semibold text-foreground">
                任务热力图
              </h2>
              <span className="text-xs text-muted-foreground">
                按通过率着色：绿≥90% 黄≥70% 橙≥50% 红&lt;50%
              </span>
            </div>
            <Card>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" role="table">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          任务
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          平均分
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          提交数
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          通过率
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                          热力
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {MOCK_HEAT_DATA.map((item) => (
                        <tr
                          key={item.taskId}
                          className="border-b border-border/50 hover:bg-muted/50"
                        >
                          <td className="px-4 py-3 font-medium text-foreground">{item.taskName}</td>
                          <td className="px-4 py-3 text-foreground">{item.avgScore}</td>
                          <td className="px-4 py-3 text-muted-foreground">{item.submissions}</td>
                          <td className="px-4 py-3 text-foreground">
                            {(item.passRate * 100).toFixed(1)}%
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`h-4 w-24 rounded border ${getHeatColor(item.passRate)}`}
                                style={{ width: `${item.passRate * 100}%` }}
                                role="img"
                                aria-label={`${item.taskName} 通过率 ${(item.passRate * 100).toFixed(1)}%`}
                              />
                              <span className="text-xs text-muted-foreground w-16 text-right">
                                {(item.passRate * 100).toFixed(0)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Timeline Section */}
          <section id="timeline" aria-labelledby="timeline-title" className="mt-2">
            <h2 id="timeline-title" className="text-lg font-semibold text-foreground mb-4">
              实时活动流
            </h2>
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {MOCK_TIMELINE.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-shrink-0 w-20 text-xs text-muted-foreground font-mono">
                        {item.time}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-foreground">{item.student}</span>
                          <span className="text-muted-foreground">{item.action}</span>
                          <span className="text-primary font-medium">{item.task}</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            item.status === '通过'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : item.status === '失败'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Placeholder for future charts */}
          <section id="charts" aria-labelledby="charts-title" className="mt-2">
            <h2 id="charts-title" className="text-lg font-semibold text-foreground mb-4">
              趋势图表 (占位)
            </h2>
            <Card>
              <CardContent className="py-12 px-4">
                <div className="text-center text-muted-foreground">
                  <svg
                    className="mx-auto mb-4 size-12 opacity-50"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="M3 3v18h18" />
                    <path d="m19 9-5 5-4-4-3 3" />
                  </svg>
                  <p className="text-lg font-medium text-foreground">图表组件待接入</p>
                  <p className="text-sm mt-1">
                    计划接入 Recharts / Tremor 实现提交趋势、分数分布、知识点掌握度等可视化
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      {/* Right Sidebar - Luna Panel */}
      <aside className="flex-shrink-0 w-[360px] border-l border-border bg-card hidden lg:block">
        <div className="flex h-full flex-col">
          <div className="flex h-12 items-center justify-between border-b border-border px-4">
            <h2 className="text-sm font-medium text-foreground">Luna AI 助教</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="h-full">
              <p className="text-sm text-muted-foreground p-4 text-center">
                Luna AI 面板 - 教师视角占位
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
