'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MonacoWorkspace from '@/components/editor/MonacoWorkspace';

const initialCode = `#include <stdio.h>

/* Locked region: function signature - DO NOT MODIFY */
int calculate_sum(int n) {
    int sum = 0;
    for (int i = 1; i <= n; i++) {
        sum += i;
    }
    return sum;
}

/* Locked region: main function structure - DO NOT MODIFY */
int main() {
    int n = 100;
    int result = calculate_sum(n);
    printf("Sum from 1 to %d is: %d\\n", n, result);
    return 0;
}`;

const lockedRegions = [
  { startLineNumber: 4, endLineNumber: 11 }, // calculate_sum function
  { startLineNumber: 14, endLineNumber: 22 }, // main function
];

export default function IDEPage() {
  const [code, setCode] = useState(initialCode);
  const [isTeacherView, setIsTeacherView] = useState(false);

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
  }, []);

  return (
    <div className="flex h-full w-full flex-col p-6 gap-4">
      {/* Monaco workspace */}
      <Card className="flex-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Monaco 工作区</CardTitle>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={isTeacherView}
                onChange={(e) => setIsTeacherView(e.target.checked)}
                className="w-4 h-4 rounded border-input bg-background focus:ring-2 focus:ring-ring"
              />
              教师视角 (可编辑锁定区域)
            </label>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0">
          <MonacoWorkspace
            value={code}
            lockedRegions={lockedRegions}
            onChange={handleCodeChange}
            isTeacherView={isTeacherView}
          />
        </CardContent>
      </Card>

      {/* Guide question mock + verify button placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>引导问题与验证</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">引导问题</label>
            <textarea
              className="w-full min-h-[80px] p-3 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="在此输入引导问题..."
              defaultValue="请编写一个 C 程序，计算 1 到 100 的和。"
              readOnly
            />
          </div>
          <Button variant="outline" disabled className="w-full">
            验证 (占位符)
          </Button>
          <p className="text-xs text-muted-foreground text-center">验证按钮为占位符，无业务逻辑</p>
        </CardContent>
      </Card>
    </div>
  );
}
