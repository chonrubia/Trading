# MCP — estado honesto

No puedo instalar ni gestionar servidores MCP desde aquí (no tengo esa capacidad: MCP se configura en el cliente). Lo que sí dejo preparado:

## Recomendados para este proyecto
1. **GitHub MCP** (`github.com/github/github-mcp-server`): leer issues/PRs/Actions, abrir issues con specs y fallos del motor. Uso: publicar cada spec y cada latido fallido como issue.
2. **Vercel MCP** (`vercel.com` MCP): ver deploys, logs de `/api/*` y usage sin entrar al dashboard. Uso: depurar el corte web (F4) y vigilar cuotas.

## Instalación (la haces tú en 2 min, yo no puedo)
Añadir a tu `opencode.json`:
```json
{ "mcp": {
  "github": { "type": "remote", "url": "https://api.githubcopilot.com/mcp/", "headers": { "Authorization": "Bearer TU_TOKEN" } },
  "vercel": { "type": "remote", "url": "https://mcp.vercel.com/mcp" }
} }
```
(Requiere token de GitHub con `repo` y login en Vercel respectivamente.)
Cuando estén activos los usaré en cada paso: specs→issues, deploys→logs, cuotas→usage.
