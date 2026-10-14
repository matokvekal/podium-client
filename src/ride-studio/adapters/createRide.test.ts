import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDraft } from "../engine/draft";
import { applyAnswers } from "../engine/flow";
import type { Answer, RideDraft } from "../engine/types";

const apiMutate = vi.fn();
const apiRequest = vi.fn();

vi.mock("../../lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");
  return {
    ...actual,
    apiMutate: (...a: unknown[]) => apiMutate(...a),
    apiRequest: (...a: unknown[]) => apiRequest(...a),
  };
});

import { ApiError } from "../../lib/api-client";
import { createRide, DraftInvalidError } from "./createRide";
import {
  buildCreateBody,
  buildRouteBody,
  climbOf,
  IncompleteDraftError,
  pickIndices,
  ROUTE_MAX_POINTS,
} from "./payload";

const NOW = new Date(2026, 9, 13, 10, 0);
const TRACK = {
  kind: "library",
  name: "Hills",
  sourceEventId: "e1",
  route: {
    points: [
      [32.1, 34.8],
      [32.2, 34.9],
    ],
    distanceKm: 40,
    elevationM: 520,
  },
};
const ui = (questionId: string, field: Answer["field"], value: unknown): Answer => ({
  questionId,
  field,
  value,
  source: "ui",
});

function ready(over: Answer[] = [], id = "33333333-3333-4333-8333-333333333333"): RideDraft {
  const start = createDraft({ locale: "en", country: "IL", submissionId: id, now: 1 });
  return applyAnswers(start, [
    ui("ride.type", "activityType", "road"),
    ui("ride.name", "name", "  Saturday loop  "),
    ui("route.choice", "route", TRACK),
    ui("ride.start", "startsAt", "2026-10-20T06:30"),
    ui("ride.visibility", "visibility", "public"),
    ...over,
  ]).draft;
}

beforeEach(() => {
  apiMutate.mockReset();
  apiRequest.mockReset();
});

describe("the create request body", () => {
  it("is what the original form sends: fixed ride fields, trimmed name, ISO start, explicit defaults", () => {
    const body = buildCreateBody(ready([ui("ride.where", "place", " Car park ")]));
    expect(body).toMatchObject({
      name: "Saturday loop",
      type: "RIDE",
      requiresBib: false,
      displayMode: "standard",
      visibility: "public",
      location: "Car park",
      country: "IL",
      activityType: "road",
      elevationGainM: 520,
      meetingPoint: null,
      autoCheckIn: true,
      chatEnabled: true,
      showParticipants: true,
      rideImageKey: null,
      joinAsRider: true,
      description: null,
    });
    expect(body.startsAt).toBe(new Date("2026-10-20T06:30").toISOString());
  });

  it("sends a region only for Israel, and approval only for public rides", () => {
    expect(buildCreateBody(ready([ui("ride.where", "region", "negev")])).region).toBe("negev");
    const abroad = buildCreateBody(
      ready([ui("ride.where", "country", "CH"), ui("ride.where", "region", "negev")]),
    );
    expect("region" in abroad).toBe(false);
    expect(
      buildCreateBody(ready([ui("ride.details", "requiresApproval", true)])).requiresApproval,
    ).toBe(true);
    const priv = buildCreateBody(
      ready([
        ui("ride.visibility", "visibility", "private"),
        ui("ride.details", "requiresApproval", true),
      ]),
    );
    expect(priv.requiresApproval).toBe(false);
  });

  it("carries the chosen cover and the description", () => {
    const body = buildCreateBody(
      ready([
        ui("ride.cover", "coverKey", "road-2"),
        ui("ride.details", "description", " Be on time "),
      ]),
    );
    expect(body.rideImageKey).toBe("road-2");
    expect(body.description).toBe("Be on time");
  });

  it("refuses an incomplete draft", () => {
    const empty = createDraft({ locale: "en" });
    expect(() => buildCreateBody(empty)).toThrow(IncompleteDraftError);
  });
});

describe("the route request body", () => {
  const own = (route: Record<string, unknown>) =>
    ({ kind: "gpx", name: "a.gpx", sourceEventId: null, route }) as never;

  it("sends a picked or uploaded track as geometry and keeps elevations aligned", () => {
    const points: [number, number][] = [
      [1, 1],
      [2, 2],
      [3, 3],
    ];
    const body = buildRouteBody(
      own({ points, distanceKm: 3, elevationM: 20, elevations: [1, null, 3] }),
    );
    expect(body).toEqual({ points, distanceKm: 3, elevationM: 20, elevations: [1, null, 3] });
  });

  it("omits elevations that do not line up with the points", () => {
    const points: [number, number][] = [
      [1, 1],
      [2, 2],
    ];
    expect(
      buildRouteBody(own({ points, distanceKm: 1, elevationM: null, elevations: [1] })),
    ).toEqual({
      points,
      distanceKm: 1,
      elevationM: null,
    });
  });

  it("reduces an oversized track to the server's cap, keeping first and last", () => {
    const n = ROUTE_MAX_POINTS * 3;
    const points = Array.from({ length: n }, (_, i) => [i / 1000, i / 1000] as [number, number]);
    const elevations = points.map((_, i) => i);
    const body = buildRouteBody(own({ points, distanceKm: 9, elevationM: 1, elevations })) as {
      points: [number, number][];
      elevations: number[];
    };
    expect(body.points).toHaveLength(ROUTE_MAX_POINTS);
    expect(body.elevations).toHaveLength(ROUTE_MAX_POINTS);
    expect(body.points[0]).toEqual(points[0]);
    expect(body.points.at(-1)).toEqual(points.at(-1));
    expect(body.elevations[0]).toBe(0);
    expect(body.elevations.at(-1)).toBe(n - 1);
    expect(pickIndices(5, 10)).toEqual([0, 1, 2, 3, 4]);
  });

  it("reports the climb a ride advertises", () => {
    expect(climbOf(null)).toBeNull();
    const pts = [
      [1, 1],
      [2, 2],
    ];
    expect(climbOf(own({ points: pts, distanceKm: 1, elevationM: null }))).toBeNull();
    expect(climbOf(own({ points: pts, distanceKm: 1, elevationM: 80 }))).toBe(80);
  });
});

describe("creating the ride", () => {
  it("sends the draft's submission id as the client action id, then attaches the track", async () => {
    apiMutate.mockResolvedValue({
      result: { id: "ride-1", name: "Saturday loop" },
      alreadyApplied: false,
    });
    apiRequest.mockResolvedValue(undefined);
    const draft = ready();

    const created = await createRide(draft, NOW);

    expect(apiMutate).toHaveBeenCalledTimes(1);
    const [path, options] = apiMutate.mock.calls[0];
    expect(path).toBe("/events");
    expect(options).toMatchObject({ method: "POST", clientActionId: draft.submissionId });
    expect(apiRequest).toHaveBeenCalledWith("/events/ride-1/route", {
      method: "POST",
      body: { points: TRACK.route.points, distanceKm: 40, elevationM: 520 },
    });
    expect(created).toMatchObject({ alreadyCreated: false, routeError: null });
  });

  it("two taps at once make ONE request", async () => {
    let release!: (v: unknown) => void;
    apiMutate.mockReturnValue(new Promise((r) => (release = r)));
    apiRequest.mockResolvedValue(undefined);
    const draft = ready();

    const first = createRide(draft, NOW);
    const second = createRide(draft, NOW);
    release({ result: { id: "ride-2" }, alreadyApplied: false });

    expect(await first).toBe(await second);
    expect(apiMutate).toHaveBeenCalledTimes(1);
  });

  it("a retry after success is the same action: the server's stored answer comes back", async () => {
    apiMutate.mockResolvedValue({ result: { id: "ride-3" }, alreadyApplied: true });
    apiRequest.mockResolvedValue(undefined);
    const again = await createRide(ready([], "44444444-4444-4444-8444-444444444444"), NOW);
    expect(again.alreadyCreated).toBe(true);
  });

  it("a failed request can be retried and carries the same id", async () => {
    apiMutate.mockRejectedValueOnce(new ApiError(503, "down", "UNAVAILABLE"));
    const draft = ready([], "55555555-5555-4555-8555-555555555555");
    await expect(createRide(draft, NOW)).rejects.toBeInstanceOf(ApiError);

    apiMutate.mockResolvedValueOnce({ result: { id: "ride-4" }, alreadyApplied: false });
    apiRequest.mockResolvedValue(undefined);
    await expect(createRide(draft, NOW)).resolves.toMatchObject({ event: { id: "ride-4" } });
    expect(apiMutate.mock.calls.map((c) => c[1].clientActionId)).toEqual([
      draft.submissionId,
      draft.submissionId,
    ]);
  });

  it("keeps the ride when only the track fails to attach, and says so", async () => {
    apiMutate.mockResolvedValue({ result: { id: "ride-5" }, alreadyApplied: false });
    apiRequest.mockRejectedValue(new ApiError(500, "route failed", "SERVER"));
    const created = await createRide(ready([], "66666666-6666-4666-8666-666666666666"), NOW);
    expect(created.event.id).toBe("ride-5");
    expect(created.routeError).toBe("route failed");
  });

  it("sends nothing for an incomplete or invalid draft", async () => {
    await expect(
      createRide(createDraft({ locale: "en", country: "IL" }), NOW),
    ).rejects.toBeInstanceOf(IncompleteDraftError);
    const past = ready(
      [ui("ride.start", "startsAt", "2026-10-01T06:30")],
      "77777777-7777-4777-8777-777777777777",
    );
    await expect(createRide(past, NOW)).rejects.toBeInstanceOf(IncompleteDraftError);
    expect(apiMutate).not.toHaveBeenCalled();
    expect(DraftInvalidError).toBeDefined();
  });
});
