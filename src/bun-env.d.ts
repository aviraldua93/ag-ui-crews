/**
 * Minimal Bun type declarations for ag-ui-crews
 * The full @types/bun package has a packaging issue; this provides the subset we use.
 */

declare module "bun" {
  export function serve(options: {
    port?: number;
    hostname?: string;
    fetch: (req: Request, server: any) => Response | Promise<Response>;
  }): { port: number; hostname: string; stop(): void };

  export function file(path: string): {
    exists(): Promise<boolean>;
    text(): Promise<string>;
    type: string;
    size: number;
  };
}

declare namespace Bun {
  function serve(options: {
    port?: number;
    hostname?: string;
    fetch: (req: Request, server: any) => Response | Promise<Response>;
  }): { port: number; hostname: string; stop(): void };

  function file(path: string): BunFile;

  interface BunFile extends Blob {
    exists(): Promise<boolean>;
    text(): Promise<string>;
    type: string;
    size: number;
  }
}

interface ImportMeta {
  dir: string;
  file: string;
  path: string;
  url: string;
}
