'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useCallback } from 'react';
import type * as monaco from 'monaco-editor';
import { useTheme } from '@/components/theme/ThemeProvider';

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then((mod) => mod.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      Loading Monaco Editor…
    </div>
  ),
});

interface LockedRegion {
  startLineNumber: number;
  endLineNumber: number;
}

interface MonacoWorkspaceProps {
  value: string;
  lockedRegions: LockedRegion[];
  onChange: (value: string) => void;
  isTeacherView?: boolean;
  /** 越权编辑被回滚后触发（前端提示用）；后端 verify 仍会独立二次校验 */
  onLockViolation?: () => void;
}

export default function MonacoWorkspace({
  value,
  lockedRegions,
  onChange,
  isTeacherView = false,
  onLockViolation,
}: MonacoWorkspaceProps) {
  const { theme } = useTheme();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const isUpdatingRef = useRef(false);
  const lastValueRef = useRef(value);

  // Use a ref to always read the latest lockedRegions in event handlers
  const lockedRegionsRef = useRef(lockedRegions);
  lockedRegionsRef.current = lockedRegions;

  // Check if a range overlaps with any locked region (reads from ref for latest)
  const overlapsLockedRegion = useCallback(
    (range: monaco.Range) => {
      const currentRegions = lockedRegionsRef.current;
      return currentRegions.some((locked) => {
        return !(
          range.endLineNumber < locked.startLineNumber ||
          range.startLineNumber > locked.endLineNumber
        );
      });
    },
    [] // No dependencies - reads from ref
  );

  // Apply locked region decorations
  const applyDecorations = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      const decorations = lockedRegions.map((region) => ({
        range: {
          startLineNumber: region.startLineNumber,
          startColumn: 1,
          endLineNumber: region.endLineNumber,
          endColumn: 1073741824,
        },
        options: {
          className: 'locked-line',
          glyphMarginClassName: 'locked-glyph',
          overviewRuler: {
            color: '#f59e0b',
            position: 1 as unknown as monaco.editor.OverviewRulerLane,
          },
          stickiness: 1 as unknown as monaco.editor.TrackedRangeStickiness,
        },
      }));

      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations);
    },
    [lockedRegions]
  );

  const handleEditorDidMount = useCallback(
    (
      editor: monaco.editor.IStandaloneCodeEditor,
      monacoInstance: typeof import('monaco-editor')
    ) => {
      editorRef.current = editor;
      monacoRef.current = monacoInstance;

      // Define both light and dark themes
      monacoInstance.editor.defineTheme('luna-light', {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#fafafa',
          'editor.foreground': '#171717',
          'editor.lineHighlightBackground': '#f4f4f5',
          'editorLineNumber.foreground': '#a1a1aa',
          'editorLineNumber.activeForeground': '#171717',
        },
      });

      monacoInstance.editor.defineTheme('luna-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#0a0a0a',
          'editor.foreground': '#ededed',
          'editor.lineHighlightBackground': '#1a1a1a',
          'editorLineNumber.foreground': '#6b7280',
          'editorLineNumber.activeForeground': '#ededed',
        },
      });

      // Set initial theme based on context
      monacoInstance.editor.setTheme(theme === 'dark' ? 'luna-dark' : 'luna-light');

      // Apply initial decorations
      applyDecorations(editor);

      // Listen for content changes
      editor.onDidChangeModelContent((event: monaco.editor.IModelContentChangedEvent) => {
        if (isUpdatingRef.current) return;

        const model = editor.getModel();
        if (!model) return;

        const newValue = model.getValue();
        if (newValue === lastValueRef.current) return;

        // Check if any change overlaps with locked regions
        const changes = event.changes;
        let hasLockedOverlap = false;

        for (const change of changes) {
          const changeRange = new monacoInstance.Range(
            change.range.startLineNumber,
            change.range.startColumn,
            change.range.endLineNumber,
            change.range.endColumn
          );

          if (overlapsLockedRegion(changeRange)) {
            hasLockedOverlap = true;
            break;
          }
        }

        if (hasLockedOverlap && !isTeacherView) {
          // Rollback: restore previous value
          isUpdatingRef.current = true;
          editor.executeEdits('rollback', [
            {
              range: new monacoInstance.Range(
                1,
                1,
                model.getLineCount(),
                model.getLineMaxColumn(model.getLineCount())
              ),
              text: lastValueRef.current,
              forceMoveMarkers: true,
            },
          ]);
          isUpdatingRef.current = false;
          onLockViolation?.();
          return;
        }

        // Valid change - update ref and notify
        lastValueRef.current = newValue;
        onChange(newValue);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyDecorations, onChange, isTeacherView, onLockViolation, theme]
  );

  // Update decorations when lockedRegions change
  useEffect(() => {
    if (editorRef.current) {
      applyDecorations(editorRef.current);
    }
  }, [applyDecorations]);

  // Update editor value when prop changes (external updates)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || isUpdatingRef.current) return;

    if (value !== lastValueRef.current) {
      isUpdatingRef.current = true;
      const model = editor.getModel();
      if (model) {
        const lastCol = model.getLineMaxColumn(model.getLineCount());
        editor.executeEdits('external', [
          {
            range: {
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: model.getLineCount(),
              endColumn: lastCol,
              // satisfy IRange shape for executeEdits
            } as unknown as monaco.Range,
            text: value,
            forceMoveMarkers: true,
          } as unknown as monaco.editor.IIdentifiedSingleEditOperation,
        ]);
        lastValueRef.current = value;
      }
      isUpdatingRef.current = false;
    }
  }, [value]);

  // Sync Monaco theme when context theme changes
  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(theme === 'dark' ? 'luna-dark' : 'luna-light');
    }
  }, [theme]);

  return (
    <div className="flex h-full w-full">
      <MonacoEditor
        height="100%"
        width="100%"
        language="c"
        value={value}
        theme={theme === 'dark' ? 'luna-dark' : 'luna-light'}
        onMount={handleEditorDidMount}
        options={{
          fontSize: 14,
          lineHeight: 22,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          insertSpaces: true,
          wordWrap: 'on',
          glyphMargin: true,
          lineNumbers: 'on',
          folding: true,
          matchBrackets: 'always',
          autoClosingBrackets: 'always',
          autoClosingQuotes: 'always',
          formatOnPaste: true,
          formatOnType: true,
          renderLineHighlight: 'all',
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          smoothScrolling: true,
        }}
      />
      <style jsx>{`
        .locked-line {
          background-color: rgba(156, 163, 175, 0.1) !important;
          position: relative;
        }
        .locked-line::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background-color: #f59e0b;
        }
        .locked-glyph::after {
          content: '🔒';
          display: inline-block;
          width: 16px;
          height: 16px;
          text-align: center;
          line-height: 16px;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
