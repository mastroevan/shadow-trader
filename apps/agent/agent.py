import os
from typing import Annotated, TypedDict
import operator

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode

load_dotenv()


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]


SYSTEM_PROMPT = """
You are Shadow Trader's OpenAI/LangGraph trading analysis agent.

Your job is to analyze stocks and crypto assets for short-term trading setups.

You have access to:
- Market data
- Technical analysis
- Company news if configured

Use tools when the user only provides a ticker or asks you to look up fresh
market context. When the user provides a structured market payload, treat that
payload as the primary source of truth and use tools only if they add useful
context.

When the user asks for JSON, return only valid JSON that matches the requested
schema. Do not wrap JSON in markdown.

For standalone text questions, return this format:
Ticker:
Direction: BULLISH, BEARISH, or NEUTRAL
Confidence: 0-100

Thesis:
2-4 direct sentences explaining the setup.

Key Levels:
- Support:
- Resistance:
- 20-day SMA:
- 50-day SMA:

Catalysts / News:
- Mention relevant news if available.
- If no news tool data is available, say so briefly.

Suggested Action:
Give a practical watchlist-style action, not a guaranteed buy/sell instruction.

Risk Notes:
Mention invalidation level, volatility, and that this is not financial advice.

Rules:
- Do not guarantee profits.
- Do not tell the user they must buy, sell, or short.
- Be direct, practical, and trading-focused.
- If data is delayed or incomplete, say that clearly.
"""


def get_tools():
    try:
        from apps.agent.tools.market_data import get_market_data
        from apps.agent.tools.technicals import get_technical_analysis
        from apps.agent.tools.news import get_company_news
    except ModuleNotFoundError:
        from tools.market_data import get_market_data
        from tools.technicals import get_technical_analysis
        from tools.news import get_company_news

    return [
        get_market_data,
        get_technical_analysis,
        get_company_news,
    ]


def get_selected_model(provider: str = "openai") -> tuple[str, str]:
    mode = os.getenv("SHADOW_TRADER_MODE", "fast").lower()

    if provider == "anthropic":
        if mode == "deep":
            selected_model = os.getenv("ANTHROPIC_MODEL_DEEP", "claude-3-5-sonnet-20241022")
        else:
            selected_model = os.getenv("ANTHROPIC_MODEL_FAST", "claude-3-5-haiku-20241022")
    elif provider == "google":
        if mode == "deep":
            selected_model = os.getenv("GOOGLE_MODEL_DEEP", "gemini-1.5-pro")
        else:
            selected_model = os.getenv("GOOGLE_MODEL_FAST", "gemini-2.0-flash")
    else:
        if mode == "deep":
            selected_model = os.getenv("OPENAI_MODEL_DEEP", "gpt-4o")
        else:
            selected_model = os.getenv("OPENAI_MODEL_FAST", "gpt-4o-mini")

    return mode, selected_model


def get_openai_timeout_seconds() -> float:
    raw_timeout = os.getenv("OPENAI_TIMEOUT_MS", "60000")

    try:
        timeout_ms = int(raw_timeout)
    except ValueError:
        timeout_ms = 60000

    return max(timeout_ms, 5000) / 1000


def create_chat_model(provider: str, model_name: str, timeout: float):
    if provider == "anthropic":
        try:
            from langchain_anthropic import ChatAnthropic
            api_key = os.getenv("ANTHROPIC_API_KEY")
            return ChatAnthropic(model=model_name, temperature=0, timeout=timeout, api_key=api_key)
        except ImportError:
            pass
    elif provider == "google":
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            return ChatGoogleGenerativeAI(model=model_name, temperature=0, timeout=timeout, google_api_key=api_key)
        except ImportError:
            pass

    # Default to ChatOpenAI
    return ChatOpenAI(
        model=model_name if provider == "openai" else "gpt-4o-mini",
        temperature=0,
        timeout=timeout,
    )


def build_agent(provider: str = "openai", model: Optional[str] = None, use_tools: bool = True):
    mode, default_model = get_selected_model(provider)
    selected_model = model or default_model
    print(f"Using {provider.capitalize()} model: {selected_model} ({mode} mode)")

    chat_model = create_chat_model(
        provider=provider,
        model_name=selected_model,
        timeout=get_openai_timeout_seconds(),
    )

    tools = get_tools() if use_tools else []
    model_for_request = chat_model.bind_tools(tools) if tools and hasattr(chat_model, "bind_tools") else chat_model

    def call_model(state: AgentState):
        response = model_for_request.invoke(
            [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]
        )

        return {"messages": [response]}

    workflow = StateGraph(AgentState)

    workflow.add_node("agent", call_model)
    if tools and hasattr(chat_model, "bind_tools"):
        workflow.add_node("tools", ToolNode(tools))

    workflow.add_edge(START, "agent")
    if tools and hasattr(chat_model, "bind_tools"):
        workflow.add_conditional_edges(
            "agent",
            should_continue,
            {
                "tools": "tools",
                END: END,
            },
        )
        workflow.add_edge("tools", "agent")
    else:
        workflow.add_edge("agent", END)

    return workflow.compile()


def should_continue(state: AgentState):
    last_message = state["messages"][-1]

    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"

    return END


def analyze(
    question: str,
    provider: str = "openai",
    model: Optional[str] = None,
    use_tools: bool = True,
) -> str:
    agent = build_agent(provider=provider, model=model, use_tools=use_tools)
    result = agent.invoke(
        {
            "messages": [
                HumanMessage(content=question)
            ]
        }
    )

    return result["messages"][-1].content



if __name__ == "__main__":
    user_input = input("Ticker/question: ")

    print("\nAnalyzing...\n")

    response = analyze(user_input)

    print("--- Shadow Trader Agent Response ---\n")
    print(response)
