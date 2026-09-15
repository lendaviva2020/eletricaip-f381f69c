# Inserir tag canonical no head principal

## Contexto

Este projeto usa TanStack Start; nao existe um `index.html` estatico. O `<head>` e gerado pela funcao `head()` das rotas. A configuracao do shell raiz fica em `src/routes/__root.tsx`.

## Acao

Adicionar em `src/routes/__root.tsx` o link canonical apontando para `https://tvengenharia.com.br`:

```text
links: [{ rel: "canonical", href: "https://tvengenharia.com.br" }]
```

## Validacao

- `bunx tsc --noEmit` para garantir que a tipagem nao quebra.
- `bunx eslint .` para verificar estilo.

## Observacao

A canonical sera inserida no head raiz, o que a replica em todas as rotas. Para SEO ideal, canonical deveria ficar apenas nas rotas folha (ex.: `src/routes/index.tsx` para a home). Como a solicitacao e "arquivo HTML principal onde fica o `<head>`", aplico na raiz.
