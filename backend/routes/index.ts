import "server-only";
import * as audit from "../controllers/audit.controller";
import * as auth from "../controllers/auth.controller";
import * as health from "../controllers/health.controller";
import * as orders from "../controllers/orders.controller";
import * as recipes from "../controllers/recipes.controller";
import * as sewing from "../controllers/sewing.controller";
import * as verification from "../controllers/verification.controller";

/**
 * API route table — the single place that maps every endpoint + HTTP method to its controller
 * (like an Express router). Next.js discovers routes from the filesystem, so each
 * `frontend/app/api/<path>/route.ts` is a one-line binding to the matching entry here.
 */
export const apiRoutes = {
  "/api/health": { GET: health.GET },

  "/api/auth/login": { POST: auth.login },
  "/api/auth/logout": { POST: auth.logout },
  "/api/auth/me": { GET: auth.me },

  "/api/recipes": { GET: recipes.listRecipesHandler },
  "/api/recipes/[id]": { GET: recipes.getRecipeHandler },
  "/api/recipes/[id]/breakdown": { GET: recipes.recipeBreakdownHandler },

  "/api/orders": { GET: orders.listOrdersHandler, POST: orders.createOrderHandler },
  "/api/orders/[id]": { GET: orders.getOrderHandler },
  "/api/orders/[id]/recut": { POST: orders.recutOrderHandler },
  "/api/orders/[id]/timeline": { GET: audit.orderTimelineHandler },

  "/api/verification": { GET: verification.listPendingHandler },
  "/api/verification/[orderId]": { GET: verification.getVerificationHandler },
  "/api/verification/[orderId]/counts": { PUT: verification.saveCountsHandler },
  "/api/verification/[orderId]/approve": { POST: verification.approveHandler },
  "/api/verification/[orderId]/reject": { POST: verification.rejectHandler },

  "/api/sewing": { GET: sewing.sewingQueueHandler },
  "/api/sewing/[orderId]": { GET: sewing.sewingOrderHandler },
  "/api/sewing/[orderId]/start": { POST: sewing.startAssemblyHandler },

  "/api/audit/summary": { GET: audit.auditSummaryHandler },
  "/api/audit/decisions": { GET: audit.auditDecisionsHandler },
} as const;

export type ApiPath = keyof typeof apiRoutes;
