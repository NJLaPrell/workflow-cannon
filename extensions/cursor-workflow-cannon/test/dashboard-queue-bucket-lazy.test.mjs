import assert from "node:assert/strict";
import test from "node:test";
import {
  buildListTasksArgsForQueueBucket,
  filterTasksForQueueBucketCategory,
  renderQueueBucketRowsHtml
} from "../dist/views/dashboard/dashboard-queue-bucket-lazy.js";

test("buildListTasksArgsForQueueBucket maps categories to list-tasks argv", () => {
  assert.deepEqual(buildListTasksArgsForQueueBucket("ready", "14", 50), {
    phaseKey: "14",
    limit: 50,
    status: "ready"
  });
  assert.deepEqual(buildListTasksArgsForQueueBucket("proposed-improvement", "14", 25), {
    phaseKey: "14",
    limit: 25,
    status: "proposed",
    type: "improvement"
  });
  assert.deepEqual(buildListTasksArgsForQueueBucket("proposed-execution", "15", 25), {
    phaseKey: "15",
    limit: 25,
    status: "proposed"
  });
  assert.deepEqual(buildListTasksArgsForQueueBucket("transcript-churn", "14", 25), {
    phaseKey: "14",
    limit: 25,
    status: "research",
    type: "transcript_churn"
  });
  assert.deepEqual(buildListTasksArgsForQueueBucket("blocked", "__no_phase__", 25), {
    phaseKey: "__no_phase__",
    limit: 25,
    status: "blocked"
  });
  assert.deepEqual(buildListTasksArgsForQueueBucket("completed", "14", 50, "cursor-abc"), {
    phaseKey: "14",
    limit: 50,
    status: "completed",
    cursor: "cursor-abc"
  });
});

test("filterTasksForQueueBucketCategory strips improvement rows from proposed-execution", () => {
  const tasks = [
    { id: "T1", type: "execution" },
    { id: "imp-1", type: "improvement" },
    { id: "W2", type: "wishlist_intake" }
  ];
  assert.deepEqual(filterTasksForQueueBucketCategory("proposed-execution", tasks), [{ id: "T1", type: "execution" }]);
  assert.deepEqual(filterTasksForQueueBucketCategory("ready", tasks), tasks);
});

test("renderQueueBucketRowsHtml renders category-specific actions and load-more", () => {
  const readyHtml = renderQueueBucketRowsHtml("ready", [{ id: "T100", title: "Ship it" }]);
  assert.match(readyHtml, /T100/);
  assert.match(readyHtml, /data-wc-action="task-detail"/);

  const proposedHtml = renderQueueBucketRowsHtml("proposed-improvement", [
    { id: "imp-9", title: "Fix docs" }
  ]);
  assert.match(proposedHtml, /data-wc-action="proposed-imp-accept"/);
  assert.match(proposedHtml, /data-wc-action="proposed-imp-decline"/);

  const blockedHtml = renderQueueBucketRowsHtml("blocked", [{ id: "T501", title: "Blocked task" }]);
  assert.match(blockedHtml, /data-wc-action="assign-phase"/);

  const moreHtml = renderQueueBucketRowsHtml("completed", [{ id: "T099" }], {
    nextCursor: "next-page-token"
  });
  assert.match(moreHtml, /data-wc-action="queue-bucket-load-more"/);
  assert.match(moreHtml, /data-wc-queue-cursor="next-page-token"/);
  assert.match(moreHtml, /data-wc-queue-category="completed"/);
});
