from fastapi import FastAPI
from fastapi.responses import JSONResponse

from cursor_to_api import config
from cursor_to_api.openai_compat import router

app = FastAPI(
    title="cursor-to-api",
    description="OpenAI-compatible API backed by the Cursor agent CLI",
    version="0.1.0",
)
app.include_router(router)


@app.get("/")
async def root() -> JSONResponse:
    return JSONResponse(
        {
            "service": "cursor-to-api",
            "openai_base": f"http://{config.HOST}:{config.PORT}/api/v1",
            "endpoints": {
                "chat_completions": "/api/v1/chat/completions",
                "models": "/api/v1/models",
                "health": "/api/v1/health",
            },
        }
    )


def run() -> None:
    import uvicorn

    uvicorn.run(
        "cursor_to_api.main:app",
        host=config.HOST,
        port=config.PORT,
        reload=False,
    )


if __name__ == "__main__":
    run()
