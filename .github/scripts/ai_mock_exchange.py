"""Offline provider-injected exchange; does not use credentials or network."""
from ai_transport_contract import Exchange, build_request

def exchange(task, claude_adapter, openai_adapter):
    if not isinstance(task,str) or not task.strip() or len(task.encode())>4000:
        raise ValueError("Invalid task")
    first=build_request(Exchange("anthropic","MOCK_ONLY",task,256))
    claude_reply=claude_adapter(first)
    if not isinstance(claude_reply,str) or not claude_reply.strip() or len(claude_reply.encode())>4000:
        raise ValueError("Invalid Claude response")
    second=build_request(Exchange("openai","MOCK_ONLY",claude_reply,256))
    openai_reply=openai_adapter(second)
    if not isinstance(openai_reply,str) or not openai_reply.strip() or len(openai_reply.encode())>4000:
        raise ValueError("Invalid OpenAI response")
    return {"mode":"mock_only","claude":claude_reply,"openai":openai_reply,
            "founder_approval_required":True,"auto_merge":False,"auto_deploy":False}
