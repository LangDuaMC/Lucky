import createAccelerator from "json-accelerator";
import { type Static, type TSchema, Type } from "@sinclair/typebox";

export type RouteFlagName =
  | "Disabled"
  | "CacheQuery"
  | "OverrideQuery"
  | "ProxyProtocol"
  | "PreserveHost"
  | "Tunnel";

const Empty = Type.Object({});
const Id = Type.Object({ id: Type.Integer() });
const RouteReport = Type.Object({ active: Type.Integer() });
const HandshakeIdent = Type.Object({ id: Type.String() });

const InspectRequest = Type.Object({
  req: Type.Integer({ minimum: 0 }),
});

const SessionAttributes = Type.Object({}, { additionalProperties: true });

const Profile = Type.Object({
  name: Type.String(),
  uuid: Type.Optional(Type.String()),
});

const TrafficCounters = Type.Object({
  c2s_bytes: Type.Integer({ minimum: 0 }),
  s2c_bytes: Type.Integer({ minimum: 0 }),
  c2s_chunks: Type.Integer({ minimum: 0 }),
  s2c_chunks: Type.Integer({ minimum: 0 }),
  c2s_bps: Type.Integer({ minimum: 0 }),
  s2c_bps: Type.Integer({ minimum: 0 }),
});

const SessionInspect = Type.Object({
  id: Type.Integer({ minimum: 0 }),
  zone: Type.Integer({ minimum: 0 }),
  route_id: Type.Integer({ minimum: 0 }),
  client_addr: Type.String(),
  destination_addr: Type.String(),
  hostname: Type.String(),
  endpoint_host: Type.String(),
  created_at_ms: Type.Integer({ minimum: 0 }),
  last_activity_ms: Type.Integer({ minimum: 0 }),
  traffic: TrafficCounters,
  attributes: SessionAttributes,
  profile: Profile,
});

const ListSessionsResponse = Type.Object({
  req: Type.Integer({ minimum: 0 }),
  _v: Type.Array(SessionInspect),
});

const InstanceStats = Type.Object({
  inst: Type.String(),
  uptime_ms: Type.Integer({ minimum: 0 }),
  routes_active: Type.Integer({ minimum: 0 }),
  sessions_active: Type.Integer({ minimum: 0 }),
  traffic: TrafficCounters,
});

const RouteStats = Type.Object({
  id: Type.Integer({ minimum: 0 }),
  zone: Type.Integer({ minimum: 0 }),
  active_sessions: Type.Integer({ minimum: 0 }),
  traffic: TrafficCounters,
});

const TenantStats = Type.Object({
  zone: Type.Integer({ minimum: 0 }),
  active_sessions: Type.Integer({ minimum: 0 }),
  traffic: TrafficCounters,
});

const StatsSnapshot = Type.Object({
  req: Type.Integer({ minimum: 0 }),
  instance: InstanceStats,
  tenants: Type.Array(TenantStats),
  routes: Type.Array(RouteStats),
  sessions: Type.Array(
    Type.Object({
      id: Type.Integer({ minimum: 0 }),
      zone: Type.Integer({ minimum: 0 }),
      route_id: Type.Integer({ minimum: 0 }),
      last_activity_ms: Type.Integer({ minimum: 0 }),
      traffic: TrafficCounters,
    }),
  ),
});

const RouteFlag = Type.Union([
  Type.Literal("Disabled"),
  Type.Literal("CacheQuery"),
  Type.Literal("OverrideQuery"),
  Type.Literal("ProxyProtocol"),
  Type.Literal("PreserveHost"),
  Type.Literal("Tunnel"),
]);

const RouteFlagsV2 = Type.Union([
  Type.Integer({ minimum: 0 }),
  Type.Array(RouteFlag),
]);

export const RouteV2 = Type.Object({
  id: Type.Integer(),
  zone: Type.Integer({ minimum: 0 }),
  priority: Type.Integer(),
  flags: RouteFlagsV2,
  matchers: Type.Array(Type.String()),
  endpoints: Type.Array(Type.String()),
});
export type RouteV2 = Static<typeof RouteV2>;

export const RouteV1 = Type.Object({
  id: Type.Integer(),
  matchers: Type.Array(Type.String()),
  endpoints: Type.Array(Type.String()),
  disabled: Type.Boolean(),
  priority: Type.Integer(),
  handshake: Type.Union([Type.Literal("Vanilla"), Type.Literal("HAProxy")]),
  override_query: Type.Boolean(),
});
export type RouteV1 = Static<typeof RouteV1>;

function array<T extends TSchema>(schema: T) {
  return Type.Object({ _v: Type.Array(schema) });
}

const RouteListV2 = array(RouteV2);
const RouteListV1 = array(RouteV1);

type CommandsMap = Record<string, TSchema>;

function schemaFor<T extends CommandsMap>(commands: T) {
  const entries = Object.entries(commands).map(([name, schema]) =>
    Type.Composite([Type.Object({ _c: Type.Literal(name) }), schema], {
      title: name,
    }),
  );
  return Type.Union(entries, { title: "RPC Envelope" });
}

type CommandKey<T extends CommandsMap> = Extract<keyof T, string>;

type EnvelopeOf<T extends CommandsMap> = {
  [K in CommandKey<T>]: { _c: K } & Static<T[K]>;
}[CommandKey<T>];

type EnvelopeFactoryResult<T extends CommandsMap> = {
  schema: ReturnType<typeof schemaFor<T>>;
  create: <K extends CommandKey<T>>(
    command: K,
    payload: Static<T[K]>,
  ) => EnvelopeOf<T>;
  encode: (envelope: EnvelopeOf<T>) => string;
};

function buildEnvelope<T extends CommandsMap>(
  commands: T,
): EnvelopeFactoryResult<T> {
  const schema = schemaFor(commands);
  const encoder = createAccelerator(schema);
  return {
    schema,
    create: <K extends keyof T>(command: K, payload: Static<T[K]>) =>
      ({
        _c: command,
        ...(payload as Record<string, unknown>),
      }) as EnvelopeOf<T>,
    encode: (envelope: EnvelopeOf<T>) => `${encoder(envelope)}\n`,
  };
}

const CommandsV2 = {
  Hello: Empty,
  FlushRoute: Empty,
  SetRoute: RouteV2,
  RemoveRoute: Id,
  HandshakeRoute: RouteReport,
  HandshakeIdent,
  ListRouteRequest: Empty,
  ListRouteResponse: RouteListV2,
  ListSessionsRequest: InspectRequest,
  ListSessionsResponse,
  ListStatsRequest: InspectRequest,
  ListStatsResponse: StatsSnapshot,
} as const;

type CommandsV2 = typeof CommandsV2;

const TunnelToken = Type.Object({
  key_id: Type.String(),
  secret: Type.String(),
  name: Type.Optional(Type.String()),
  zone: Type.Optional(Type.Integer({ minimum: 0 })),
});

const CommandsV3 = {
  ...CommandsV2,
  FlushTunnelTokens: Empty,
  SetTunnelToken: TunnelToken,
} as const;

type CommandsV3 = typeof CommandsV3;

const CommandsV1 = {
  Hello: Empty,
  FlushRoute: Empty,
  SetRoute: RouteV1,
  RemoveRoute: Id,
  HandshakeRoute: RouteReport,
  HandshakeIdent,
  ListRouteRequest: Empty,
  ListRouteResponse: RouteListV1,
  ListSessionsRequest: InspectRequest,
  ListSessionsResponse,
  ListStatsRequest: InspectRequest,
  ListStatsResponse: StatsSnapshot,
} as const;

type CommandsV1 = typeof CommandsV1;

const EnvelopeFactoryV3 = buildEnvelope(CommandsV3);
const EnvelopeFactoryV2 = buildEnvelope(CommandsV2);
const EnvelopeFactoryV1 = buildEnvelope(CommandsV1);

export const EnvelopeV3 = EnvelopeFactoryV3.schema;
export type EnvelopeV3 = EnvelopeOf<CommandsV3>;
export const EnvelopeV2 = EnvelopeFactoryV2.schema;
export type EnvelopeV2 = EnvelopeOf<CommandsV2>;
export const EnvelopeV1 = EnvelopeFactoryV1.schema;
export type EnvelopeV1 = EnvelopeOf<CommandsV1>;

export const Envelope = EnvelopeV2;
export type Envelope = EnvelopeV2;

export const encodeEnvelopeV3 = EnvelopeFactoryV3.encode;
export const encodeEnvelopeV2 = EnvelopeFactoryV2.encode;
export const encodeEnvelopeV1 = EnvelopeFactoryV1.encode;

export const createEnvelopeV3 = EnvelopeFactoryV3.create;
export const createEnvelopeV2 = EnvelopeFactoryV2.create;
export const createEnvelopeV1 = EnvelopeFactoryV1.create;

export const encode = encodeEnvelopeV2;

export type IRoute = RouteV2;
export type IRouteV1 = RouteV1;
export type IRouteV2 = RouteV2;

export function envelope<K extends keyof CommandsV2>(
  c: K,
  v: Static<CommandsV2[K]>,
): string {
  return encodeEnvelopeV2(createEnvelopeV2(c, v));
}
