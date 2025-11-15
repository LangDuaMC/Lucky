import { describe, it } from "bun:test";
import { RecvProps, RouterService, RouterServiceConfig } from ".";

describe("Ely", () => {
  it("Properly config typecheck-pass", () => {
    class UserRouter extends RouterServiceConfig {
      recv({ env, inst }: RecvProps): void {
        this.queue("user", {
          _c: "Hello",
        });
      }
    }

    const mksvc = RouterService(new UserRouter());
  });
});
