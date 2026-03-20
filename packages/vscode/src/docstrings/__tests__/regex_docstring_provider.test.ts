import { RegexDocstringProvider } from "../regex_docstring_provider";

const provider = new RegexDocstringProvider();

describe("RegexDocstringProvider", () => {
  test("extracts docstring from named function declaration", () => {
    const content = `/** Processes input data */
function process_data(input: string): void {
  console.log(input);
}`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.get("process_data")).toMatchObject({
      symbol_name: "process_data",
      body: "Processes input data",
      line: 1,
    });
  });

  test("extracts docstring from exported async function", () => {
    const content = `/** Fetches user data from the API */
export async function fetch_user(id: string): Promise<User> {
  return await db.get(id);
}`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.get("fetch_user")).toMatchObject({
      symbol_name: "fetch_user",
      body: "Fetches user data from the API",
    });
  });

  test("extracts docstring from arrow function assigned to const", () => {
    const content = `/** Transforms raw data into domain objects */
export const transform_data = (raw: RawData): DomainObject => {
  return parse(raw);
};`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.get("transform_data")).toMatchObject({
      symbol_name: "transform_data",
      body: "Transforms raw data into domain objects",
    });
  });

  test("extracts docstring from class and its methods", () => {
    const content = `/** Manages database connections */
export class ConnectionManager {
  /** Opens a new connection */
  async open(config: Config): Promise<Connection> {
    return new Connection(config);
  }

  /** Closes all active connections */
  close(): void {
    this.connections.forEach(c => c.close());
  }
}`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.get("ConnectionManager")).toMatchObject({
      body: "Manages database connections",
    });
    expect(result.get("ConnectionManager.open")).toMatchObject({
      body: "Opens a new connection",
    });
    expect(result.get("ConnectionManager.close")).toMatchObject({
      body: "Closes all active connections",
    });
  });

  test("strips JSDoc tags from multiline docstring", () => {
    const content = `/**
 * Calculates the total price including tax.
 *
 * This handles various edge cases for different
 * regional tax rules.
 *
 * @param items - The line items to total
 * @param region - Tax region code
 * @returns The calculated total with tax
 */
function calculate_total(items: LineItem[], region: string): number {
  return 0;
}`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.get("calculate_total")?.body).toBe(
      "Calculates the total price including tax.\n\nThis handles various edge cases for different\nregional tax rules."
    );
  });

  test("handles export default function", () => {
    const content = `/** Application entry point */
export default function main(): void {
  start();
}`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.get("main")).toMatchObject({
      body: "Application entry point",
    });
  });

  test("handles static methods", () => {
    const content = `class Factory {
  /** Creates a new instance */
  static create(): Factory {
    return new Factory();
  }
}`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.get("Factory.create")).toMatchObject({
      body: "Creates a new instance",
    });
  });

  test("handles interface declarations", () => {
    const content = `/** Configuration options for the app */
export interface AppConfig {
  port: number;
  host: string;
}`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.get("AppConfig")).toMatchObject({
      body: "Configuration options for the app",
    });
  });

  test("handles type alias declarations", () => {
    const content = `/** A mapping from symbol names to descriptions */
export type SymbolMap = Record<string, string>;`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.get("SymbolMap")).toMatchObject({
      body: "A mapping from symbol names to descriptions",
    });
  });

  test("skips non-JSDoc block comments", () => {
    const content = `/* This is not a JSDoc comment */
function not_documented(): void {}`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.size).toBe(0);
  });

  test("skips functions without docstrings", () => {
    const content = `// Regular comment
function undocumented(): void {}`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.size).toBe(0);
  });

  test("handles JSDoc with only tags (empty body)", () => {
    const content = `/**
 * @param x - input
 * @returns output
 */
function tags_only(x: number): number { return x; }`;
    const result = provider.get_docstrings("test.ts", content);
    // Empty body should be excluded
    expect(result.has("tags_only")).toBe(false);
  });

  test("handles decorators between JSDoc and declaration", () => {
    const content = `/** Handles user creation requests */
@Controller('/users')
export class UserController {
  /** Creates a new user */
  @Post('/')
  async create(req: Request): Promise<Response> {
    return new Response();
  }
}`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.get("UserController")).toMatchObject({
      body: "Handles user creation requests",
    });
    expect(result.get("UserController.create")).toMatchObject({
      body: "Creates a new user",
    });
  });

  test("handles abstract class", () => {
    const content = `/** Base service class */
export abstract class BaseService {
  /** Initializes the service */
  abstract initialize(): Promise<void>;
}`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.get("BaseService")).toMatchObject({
      body: "Base service class",
    });
    expect(result.get("BaseService.initialize")).toMatchObject({
      body: "Initializes the service",
    });
  });

  test("handles getter", () => {
    const content = `class Config {
  /** Gets the current timeout value */
  get timeout(): number { return this._timeout; }
}`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.get("Config.timeout")).toMatchObject({
      body: "Gets the current timeout value",
    });
  });

  test("single-line JSDoc", () => {
    const content = `/** Short description */
function brief(): void {}`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.get("brief")).toMatchObject({
      body: "Short description",
    });
  });

  test("multiple functions in same file", () => {
    const content = `/** First function */
function alpha(): void {}

/** Second function */
function beta(): void {}

/** Third function */
export const gamma = (): void => {};`;
    const result = provider.get_docstrings("test.ts", content);
    expect(result.size).toBe(3);
    expect(result.has("alpha")).toBe(true);
    expect(result.has("beta")).toBe(true);
    expect(result.has("gamma")).toBe(true);
  });
});
