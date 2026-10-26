import { useMutation, useQuery } from "convex/react";
import { useOutletContext } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PageHeader } from "../components/ui/PageHeader";
import { AssistantChat } from "../components/assistant/AssistantChat";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;

export function AssistantPage() {
  const { event, role, sessions } = useOutletContext<EventData>();
  const eventId = event._id as Id<"events">;
  const history = useQuery(api.assistant.history, { eventId });
  const clear = useMutation(api.assistant.clear);
  const canEdit = role !== "viewer";

  return (
    <div className="mx-auto flex w-full max-w-[48rem] flex-col">
      <PageHeader
        title="Assistant"
        meta="It knows your days, your budget and every vendor you have found."
        action={
          history && history.length > 0 && canEdit ? (
            <button className="btn-quiet btn-sm" onClick={() => void clear({ eventId })}>
              Clear
            </button>
          ) : undefined
        }
      />
      <AssistantChat eventId={eventId} canEdit={canEdit} sessions={sessions} currency={event.currency} />
    </div>
  );
}
