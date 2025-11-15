/*! Atomic implementation for the Lucky unit */

import { Elysia, t } from "elysia";
import { encodeEnvelopeV2, EnvelopeV1, EnvelopeV2 } from "./event";
import { TTLFIFOQueue } from "./spmc_ttlfifo";
import { normalizeEnvelopeV2 } from "./compat";

type ProducerItem = [string, EnvelopeV2];

const EMPTY_STRING = "";
const HEARTBEAT_SECONDS = 5;
const POLL_DELAY_MS = 10;

let time = 0;
setInterval(() => {
  time = process.uptime();
}, 500);

export interface RecvProps {
  env: EnvelopeV2;
  inst: string;
}

export abstract class RouterServiceConfig {
  readonly pc: TTLFIFOQueue<ProducerItem>;
  abstract recv({ env, inst }: RecvProps): void;

  queue(dest: string, env: EnvelopeV2) {
    this.pc.add([dest, normalizeEnvelopeV2(env)]);
  }

  constructor() {
    this.pc = new TTLFIFOQueue<ProducerItem>(1000);
  }
}

export const RouterService = (cfg: RouterServiceConfig) =>
  new Elysia()
    .model({
      EnvelopeV1,
      EnvelopeV2,
      status: t.Object(
        {
          ok: t.Boolean(),
          msg: t.Optional(t.String()),
        },
        {
          title: "Status",
        },
      ),
    })
    .decorate({
      cfg,
    })
    .get("/v2/:instance", async function* ({ set, params, cfg }) {
      const instance = params.instance || "";
      let heartbeatDeadline = time + HEARTBEAT_SECONDS;
      set.headers["X-Accel-Buffering"] = "no";
      set.headers["Content-Type"] = "text/event-stream";

      const consumer = cfg.pc.createConsumer();
      yield "1\n";

      while (true) {
        if (time > heartbeatDeadline) {
          yield "0\n";
          heartbeatDeadline = time + HEARTBEAT_SECONDS;
        }

        const item = consumer.peek();
        if (item) {
          const [target, rawEnvelope] = item;
          if (target === instance) {
            const encoded = encodeEnvelopeV2(normalizeEnvelopeV2(rawEnvelope));
            if (encoded) {
              yield encoded;
            }
          }
          consumer.seek();
          continue;
        }

        yield EMPTY_STRING;
        await delay(POLL_DELAY_MS);
      }
    })
    .post(
      "/v2/:instance",
      async ({ body, params, cfg }) => {
        const inst = params.instance || "";
        const env = normalizeEnvelopeV2(body);
        cfg.recv({ env, inst });
        return { ok: true };
      },
      {
        params: t.Object({
          instance: t.String(),
        }),
        response: {
          200: "status",
        },
        body: "EnvelopeV2",
      },
    );

const delay = (delayInms: number) =>
  new Promise((resolve) => setTimeout(resolve, delayInms));
