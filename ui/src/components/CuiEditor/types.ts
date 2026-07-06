import type { Ace } from 'ace-builds';

export interface CuiEditorProps {
  lang?: 'json' | 'yaml';
  readOnly?: boolean;
  printMargin?: number | boolean;
  options?: Partial<Ace.EditorOptions>;
  placeholder?: string;
  borderRadius?: boolean;
  borderTopRightRadius?: boolean;
  borderBottomRightRadius?: boolean;
  borderBottomLeftRadius?: boolean;
  borderTopLeftRadius?: boolean;
  border?: boolean;
}

export interface CuiEditorEmits {
  (e: 'init', aceEditor: Ace.Editor): void;
  (e: 'blur', event: Event): void;
  (e: 'input'): void;
  (e: 'change', delta: Ace.Delta): void;
  (e: 'changeSelectionStyle', data: 'text' | 'line' | 'fullLine' | 'screenLine'): void;
  (e: 'changeSession', obj: { session: Ace.EditSession; oldSession: Ace.EditSession }): void;
  (e: 'copy', obj: { text: string }): void;
  (e: 'focus', event: Event): void;
  (e: 'paste', text: string): void;
  (e: 'update:value', value: string): void;
}

export const CUI_EDITOR_DEFAULTS = {
  lang: 'yaml',
  readOnly: false,
  printMargin: false,
  borderRadius: false,
  border: true,
} satisfies Partial<CuiEditorProps>;

export const CUI_EDITOR_DEFAULT_OPTIONS = {
  useWorker: true,
  wrap: true,
  showPrintMargin: false,
  tabSize: 2,
  highlightGutterLine: true,
  useSoftTabs: true,
  dragEnabled: false,
  showGutter: true,
  scrollPastEnd: 0.1,
};
