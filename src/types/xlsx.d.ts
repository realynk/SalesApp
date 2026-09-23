declare module "xlsx" {
  export function read(
    data: Buffer | ArrayBuffer | Uint8Array,
    options?: { type?: "buffer" | "array" | "string" },
  ): {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };

  export const utils: {
    sheet_to_json: (
      sheet: unknown,
      options?: { defval?: string; raw?: boolean },
    ) => Record<string, unknown>[];
  };
}
