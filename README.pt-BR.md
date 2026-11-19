# tor-mcp

**Um navegador que passa pelo Tor, para o Claude Code e o Codex.**
Abra sites `.onion`, esconda seu IP real de todo site que o agente visitar e guarde cópias de páginas com data, hora e hash SHA-256 para a sua apuração.

Feito para **jornalistas, pesquisadores e analistas de OSINT** que já usam o Tor e querem que a IA faça a parte lenta: abrir as páginas, ler, seguir links, resumir e guardar uma cópia verificável.

## Instalar

Precisa de Node.js 20+. O Tor é **baixado sozinho** no primeiro uso (o Tor Expert Bundle oficial, conferido contra hashes SHA-256 fixados no código).

**Claude Code**

```bash
claude mcp add tor -- npx -y tor-mcp
```

**Codex** (`~/.codex/config.toml`)

```toml
[mcp_servers.tor]
command = "npx"
args = ["-y", "tor-mcp"]
```

Para o `tor_browse`, é preciso ter o Google Chrome ou o Edge instalado.

## O que isto NÃO faz

- **A empresa da IA vê tudo.** O conteúdo das páginas e seus pedidos vão para a Anthropic, a OpenAI ou quem roda o modelo. O Tor esconde seu IP dos **sites**, não da IA.
- **Não é o Tor Browser.** Um Chromium passando pelo Tor tem uma impressão digital diferente da do Tor Browser. Se a sua segurança depende de anonimato, use o [Tor Browser](https://www.torproject.org/download/) você mesmo.
- **Não envie nada que identifique você.** Nada de login, nome real ou envio de documentos. Para mandar documentos a uma redação, use o [SecureDrop](https://securedrop.org/directory/) dela direto no Tor Browser.
- **O texto das páginas não é confiável.** Uma página pode tentar dar ordens ao agente. Revise o que ele faz.

Ferramentas, configuração e detalhes: veja o [README em inglês](README.md).
