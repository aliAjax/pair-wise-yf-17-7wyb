/**
 * 项目内最小 React 类型垫片（纯环境声明文件，不含 import/export）。
 * 本仓库约定不新增依赖（package.json 锁定），因此不引入 @types/react，
 * 仅声明本项目实际用到的 API，使 tsc --noEmit 可以完成完整类型检查。
 */

declare module "react" {
  type ReactNode = unknown;

  interface ElementLike {
    readonly __brand: "react-element";
  }

  type FC<P> = (props: P) => ElementLike;
  type Setter<T> = (value: T | ((prev: T) => T)) => void;

  export function useState<T>(initial: T | (() => T)): [T, Setter<T>];
  export function useState<T = undefined>(): [T | undefined, Setter<T | undefined>];
  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: unknown[]): T;

  export function useSyncExternalStore<T>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T
  ): T;

  export interface ChangeEvent<T> {
    target: T;
  }

  interface EventTargetLike {
    value: string;
    checked: boolean;
  }

  interface CommonProps {
    key?: string;
    className?: string;
    placeholder?: string;
    disabled?: boolean;
    checked?: boolean;
    value?: string | number;
    step?: string;
    type?: string;
    title?: string;
    children?: ReactNode;
    onChange?: (e: ChangeEvent<EventTargetLike>) => void;
    onClick?: () => void;
  }

  interface InputProps extends CommonProps {
    type?: string;
  }

  interface SelectProps extends CommonProps {
    multiple?: boolean;
  }

  namespace React {
    type ReactNode = unknown;
  }

  const React: {
    StrictMode: FC<{ children?: ReactNode }>;
    createElement: unknown;
  };
  export default React;
}

declare module "react/jsx-runtime" {
  namespace JSX {
    interface BaseProps {
      key?: string | number;
      className?: string;
      title?: string;
      children?: unknown;
    }
    interface IntrinsicElements {
      main: BaseProps;
      section: BaseProps;
      aside: BaseProps;
      header: BaseProps;
      footer: BaseProps;
      nav: BaseProps;
      div: BaseProps;
      span: BaseProps;
      small: BaseProps;
      p: BaseProps;
      ul: BaseProps;
      li: BaseProps;
      dl: BaseProps;
      dt: BaseProps;
      dd: BaseProps;
      h1: BaseProps;
      h2: BaseProps;
      h3: BaseProps;
      b: BaseProps;
      strong: BaseProps;
      article: BaseProps;
      button: BaseProps & { disabled?: boolean; onClick?: () => void };
      label: BaseProps;
      input: BaseProps & {
        placeholder?: string;
        disabled?: boolean;
        checked?: boolean;
        value?: string | number;
        step?: string;
        type?: string;
        onChange?: (e: { target: { value: string; checked: boolean } }) => void;
      };
      select: BaseProps & {
        disabled?: boolean;
        value?: string;
        multiple?: boolean;
        onChange?: (e: { target: { value: string; checked: boolean } }) => void;
      };
      option: BaseProps & { value?: string };
      table: BaseProps;
      thead: BaseProps;
      tbody: BaseProps;
      tr: BaseProps;
      th: BaseProps;
      td: BaseProps;
    }
    type Element = unknown;
  }

  export const Fragment: unique symbol;
  export function jsx(type: unknown, props: Record<string, unknown>, key?: string): unknown;
  export function jsxs(type: unknown, props: Record<string, unknown>, key?: string): unknown;
}

declare module "react-dom/client" {
  interface Root {
    render(node: unknown): void;
  }
  export function createRoot(container: Element | null): Root;
}
