"""Mount all v1 routers."""

from fastapi import APIRouter

from src.api.v1 import (
    agent_actions,
    agent_files,
    agent_links,
    agent_permissions,
    agent_templates,
    agents,
    access_requests,
    audit,
    auth,
    budgets,
    dashboards,
    external_apis,
    knowledge,
    notifications,
    platform,
    prompts,
    roles,
    users,
    conversations,
    demo_files,
    client_logs,
    run_state,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(roles.router, prefix="/roles", tags=["roles"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(agent_permissions.router, prefix="/agent-permissions", tags=["agent-permissions"])
api_router.include_router(budgets.router, prefix="/budgets", tags=["budgets"])
api_router.include_router(dashboards.router, prefix="/dashboards", tags=["dashboards"])
api_router.include_router(audit.router, prefix="/audit", tags=["audit"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(external_apis.router, prefix="/external-apis", tags=["external-apis"])
api_router.include_router(platform.router, prefix="/platform", tags=["platform"])
api_router.include_router(knowledge.router, prefix="/knowledge", tags=["knowledge"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
api_router.include_router(agent_files.router, tags=["agent-files"])
api_router.include_router(agent_actions.router, tags=["agent-actions"])
api_router.include_router(agent_templates.router, tags=["agent-templates"])
api_router.include_router(agent_links.router, tags=["agent-links"])
api_router.include_router(prompts.router, tags=["prompts"])
api_router.include_router(access_requests.router, prefix="/access-requests", tags=["access-requests"])
api_router.include_router(demo_files.router, tags=["demo-files"])
api_router.include_router(client_logs.router, prefix="/logs", tags=["logs"])
api_router.include_router(run_state.router, tags=["run-state"])
