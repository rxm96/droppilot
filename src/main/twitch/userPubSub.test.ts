import { describe, expect, it } from "vitest";
import { parseUserPubSubEvent, UserPubSub } from "./userPubSub";

describe("parseUserPubSubEvent", () => {
  it("parses drop-progress payloads", () => {
    const at = 123456;
    const event = parseUserPubSubEvent(
      "user-drop-events.123",
      JSON.stringify({
        type: "drop-progress",
        data: {
          drop_id: "drop-1",
          current_progress_min: 7,
          required_progress_min: 15,
        },
      }),
      at,
    );
    expect(event).toEqual({
      kind: "drop-progress",
      at,
      topic: "user-drop-events.123",
      messageType: "drop-progress",
      dropId: "drop-1",
      currentProgressMin: 7,
      requiredProgressMin: 15,
    });
  });

  it("parses drop-claim payloads", () => {
    const event = parseUserPubSubEvent(
      "user-drop-events.123",
      JSON.stringify({
        type: "drop-claim",
        data: {
          drop_id: "drop-2",
          drop_instance_id: "instance-99",
        },
      }),
    );
    expect(event?.kind).toBe("drop-claim");
    expect(event?.dropId).toBe("drop-2");
    expect(event?.dropInstanceId).toBe("instance-99");
  });

  it("parses notification payloads only for allowed types", () => {
    const allowed = parseUserPubSubEvent(
      "onsite-notifications.123",
      JSON.stringify({
        type: "create-notification",
        data: {
          notification: {
            id: "notif-1",
            type: "user_drop_reward_reminder_notification",
          },
        },
      }),
    );
    expect(allowed?.kind).toBe("notification");
    expect(allowed?.notificationType).toBe("user_drop_reward_reminder_notification");

    const filtered = parseUserPubSubEvent(
      "onsite-notifications.123",
      JSON.stringify({
        type: "create-notification",
        data: {
          notification: {
            type: "random_notification_kind",
          },
        },
      }),
    );
    expect(filtered).toBeNull();
  });
});

describe("UserPubSub debug emission", () => {
  it("emits synthetic events through listeners and status counters", () => {
    const pubSub = new UserPubSub(async () => null);
    const captured: unknown[] = [];
    const unsubscribe = pubSub.onEvent((event) => captured.push(event));
    const event = pubSub.emitDebugEvent({
      kind: "drop-progress",
      dropId: "drop-42",
      currentProgressMin: 8,
      requiredProgressMin: 15,
    });
    unsubscribe();
    expect(event.kind).toBe("drop-progress");
    expect(event.dropId).toBe("drop-42");
    expect(captured).toHaveLength(1);
    const status = pubSub.getStatus();
    expect(status.events).toBe(1);
    expect(status.lastMessageAt).toBeTruthy();
  });
});
