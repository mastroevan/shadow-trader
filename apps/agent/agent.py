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


def get_selected_model() -> tuple[str, str]:
    mode = os.getenv("SHADOW_TRADER_MODE", "fast").lower()

    if mode == "deep":
        selected_model = os.getenv("OPENAI_MODEL_DEEP", "gpt-5.5")
    else:
        selected_model = os.getenv("OPENAI_MODEL_FAST", "gpt-5.4-mini")

    return mode, selected_model


def get_openai_timeout_seconds() -> float:
    raw_timeout = os.getenv("OPENAI_TIMEOUT_MS", "60000")

    try:
        timeout_ms = int(raw_timeout)
    except ValueError:
        timeout_ms = 60000

    return max(timeout_ms, 5000) / 1000


def build_agent(use_tools: bool = True):
    mode, selected_model = get_selected_model()
    print(f"Using OpenAI model: {selected_model} ({mode} mode)")

    model = ChatOpenAI(
        model=selected_model,
        temperature=0,
        timeout=get_openai_timeout_seconds(),
    )

    tools = get_tools() if use_tools else []
    model_for_request = model.bind_tools(tools) if tools else model

    def call_model(state: AgentState):
        response = model_for_request.invoke(
            [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]
        )

        return {"messages": [response]}

    workflow = StateGraph(AgentState)

    workflow.add_node("agent", call_model)
    if tools:
        workflow.add_node("tools", ToolNode(tools))

    workflow.add_edge(START, "agent")
    if tools:
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


def analyze(question: str, use_tools: bool = True) -> str:
    agent = build_agent(use_tools=use_tools)
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
