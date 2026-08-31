'use client';

import CheckpointWorkspace from '@/components/ide/CheckpointWorkspace';

/**
 * IDE 主页面 —— 学生完成 Checkpoint 的交互工作区。
 * 所有状态与验证逻辑都在 CheckpointWorkspace（'use client'）中。
 */
export default function IDEPage() {
  return <CheckpointWorkspace />;
}
