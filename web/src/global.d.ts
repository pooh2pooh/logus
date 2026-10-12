interface ShellLoader {
  version: string;
  ready: boolean;
  show(label?: string): void;
  hide(): void;
  begin(label?: string): void;
  end(label?: string): void;
  log(level: string, message: string): void;
  info(message: string): void;
  ok(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  net(message: string): void;
  clear(): void;
  restart(): void;
  report(): void;
  isReady(): boolean;
}

interface ShellMirrors {
  js?: string[];
  css?: string[];
  proxies?: string[];
}

interface Window {
  __APP_READY__?: boolean;
  __LOGUS_APP_MOUNTED__?: boolean;
  __LOGUS_LOADER__?: ShellLoader;
  __LOGUS_SHELL_CONFIG__?: Record<string, unknown>;
  __LOGUS_SHELL_MIRRORS__?: ShellMirrors;
}
