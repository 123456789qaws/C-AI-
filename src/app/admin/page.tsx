'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

/* ============================================================
 * Admin Page — 账号导入与系统管理
 * ============================================================ */

export default function AdminPage() {
  return (
    <AuthGuard roles={['ADMIN']}>
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">管理后台</h1>
          <p className="text-sm text-muted-foreground">账号导入、班级管理、系统配置</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>账号导入</CardTitle>
              <CardDescription>批量导入学生与教师账号</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                通过 /api/admin/import 接口批量创建用户账号。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>班级管理</CardTitle>
              <CardDescription>查看与管理所有班级</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">查看所有班级列表、学生选课情况。</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>系统配置</CardTitle>
              <CardDescription>环境变量与 Provider 状态</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                查看 AI Provider、Judge Provider、数据库连接状态。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthGuard>
  );
}
