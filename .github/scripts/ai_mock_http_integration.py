"""Fully offline mock API exchange; no credentials or external HTTP requests."""
from ai_mock_exchange import exchange
from ai_provider_http import fake_http_adapter
from ai_transport_contract import Exchange

def mock_http(provider, body):
    if provider == "anthropic":
        return {"stop_reason":"end_turn","content":[{"type":"text","text":"Claude evidence: "+body["messages"][0]["content"]}]}
    if provider == "openai":
        return {"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"OpenAI REVIEW: "+body["input"]}]}]}
    raise ValueError("Unsupported provider")

def run(task):
    def claude(body):
        return fake_http_adapter(Exchange("anthropic","MOCK_ONLY",body["messages"][0]["content"],256),mock_http)
    def openai(body):
        return fake_http_adapter(Exchange("openai","MOCK_ONLY",body["input"],256),mock_http)
    return exchange(task,claude,openai)

if __name__=="__main__":
    import json
    print(json.dumps(run("Investigate issue without changing production"),indent=2))
