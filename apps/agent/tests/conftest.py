import sys
import types
from unittest.mock import MagicMock

# If fastapi or pydantic or dotenv are not installed in the current Python environment,
# provide standard compatibility shims so tests can run in any environment.

if "requests" not in sys.modules:
    try:
        import requests
    except ImportError:
        class RequestException(Exception):
            pass

        requests_mock = types.ModuleType("requests")
        requests_mock.RequestException = RequestException
        requests_mock.post = MagicMock()
        sys.modules["requests"] = requests_mock

if "dotenv" not in sys.modules:
    try:
        import dotenv
    except ImportError:
        dotenv_mock = types.ModuleType("dotenv")
        dotenv_mock.load_dotenv = lambda *args, **kwargs: None
        sys.modules["dotenv"] = dotenv_mock

if "fastapi" not in sys.modules:
    try:
        import fastapi
    except ImportError:
        class HTTPException(Exception):
            def __init__(self, status_code: int, detail: str = ""):
                super().__init__(detail)
                self.status_code = status_code
                self.detail = detail

        class FastAPI:
            def __init__(self, *args, **kwargs):
                self.routes = {}

            def get(self, path: str):
                def decorator(fn):
                    self.routes[("GET", path)] = fn
                    return fn
                return decorator

            def post(self, path: str):
                def decorator(fn):
                    self.routes[("POST", path)] = fn
                    return fn
                return decorator

        fastapi_mock = types.ModuleType("fastapi")
        fastapi_mock.FastAPI = FastAPI
        fastapi_mock.HTTPException = HTTPException
        sys.modules["fastapi"] = fastapi_mock

if "pydantic" not in sys.modules:
    try:
        import pydantic
    except ImportError:
        class BaseModel:
            def __init__(self, **kwargs):
                for k, v in kwargs.items():
                    setattr(self, k, v)

            def dict(self, *args, **kwargs):
                return self.__dict__

            def model_copy(self, *args, **kwargs):
                import copy
                return copy.deepcopy(self)

            def copy(self, *args, **kwargs):
                import copy
                return copy.deepcopy(self)


        def Field(default=None, default_factory=None, **kwargs):
            if default_factory is not None:
                return default_factory()
            return default

        pydantic_mock = types.ModuleType("pydantic")
        pydantic_mock.BaseModel = BaseModel
        pydantic_mock.Field = Field
        sys.modules["pydantic"] = pydantic_mock

if "langchain_openai" not in sys.modules:
    try:
        import langchain_openai
    except ImportError:
        lo_mock = types.ModuleType("langchain_openai")
        lo_mock.ChatOpenAI = MagicMock()
        sys.modules["langchain_openai"] = lo_mock

if "langchain_core" not in sys.modules:
    try:
        import langchain_core
    except ImportError:
        lc_mock = types.ModuleType("langchain_core")
        lcm_mock = types.ModuleType("langchain_core.messages")
        lcm_mock.AnyMessage = MagicMock
        lcm_mock.HumanMessage = MagicMock
        lcm_mock.SystemMessage = MagicMock
        sys.modules["langchain_core"] = lc_mock
        sys.modules["langchain_core.messages"] = lcm_mock

if "langgraph" not in sys.modules:
    try:
        import langgraph
    except ImportError:
        lg_mock = types.ModuleType("langgraph")
        lgg_mock = types.ModuleType("langgraph.graph")
        lgg_mock.StateGraph = MagicMock
        lgg_mock.START = "START"
        lgg_mock.END = "END"
        lgp_mock = types.ModuleType("langgraph.prebuilt")
        lgp_mock.ToolNode = MagicMock
        sys.modules["langgraph"] = lg_mock
        sys.modules["langgraph.graph"] = lgg_mock
        sys.modules["langgraph.prebuilt"] = lgp_mock
