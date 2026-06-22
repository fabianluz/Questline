import { router } from "../trpc";
import { advisorRouter } from "./advisor";
import { attentionRouter } from "./attention";
import { boardRouter } from "./board";
import { calendarRouter } from "./calendar";
import { categoryRouter } from "./category";
import { chronicleRouter } from "./chronicle";
import { dataioRouter } from "./dataio";
import { epicRouter } from "./epic";
import { externalCalendarRouter } from "./external-calendar";
import { focusRouter } from "./focus";
import { inventoryRouter } from "./inventory";
import { journalRouter } from "./journal";
import { milestoneRouter } from "./milestone";
import { modelsRouter } from "./models";
import { notificationRouter } from "./notification";
import { prerequisiteRouter } from "./prerequisite";
import { questRouter } from "./quest";
import { resourceRouter } from "./resource";
import { scheduleRouter } from "./schedule";
import { skillRouter } from "./skill";
import { stepRouter } from "./step";
import { treeRouter } from "./tree";
import { wellbeingRouter } from "./wellbeing";
import { workspaceRouter } from "./workspace";

export const appRouter = router({
  advisor: advisorRouter,
  attention: attentionRouter,
  board: boardRouter,
  calendar: calendarRouter,
  category: categoryRouter,
  chronicle: chronicleRouter,
  dataio: dataioRouter,
  epic: epicRouter,
  externalCalendar: externalCalendarRouter,
  focus: focusRouter,
  inventory: inventoryRouter,
  journal: journalRouter,
  milestone: milestoneRouter,
  models: modelsRouter,
  notification: notificationRouter,
  prerequisite: prerequisiteRouter,
  quest: questRouter,
  resource: resourceRouter,
  schedule: scheduleRouter,
  skill: skillRouter,
  step: stepRouter,
  tree: treeRouter,
  wellbeing: wellbeingRouter,
  workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
