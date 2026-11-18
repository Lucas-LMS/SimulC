# SimulC — Cury Fluxo

**Simulações imobiliárias claras, conferíveis e prontas para conversar.**

O SimulC é uma mesa de trabalho no navegador para organizar perfis, comparar unidades e estruturar propostas de pagamento de empreendimentos Cury. A aplicação roda como site estático: não exige conta nem servidor e guarda os dados de cada pessoa no próprio navegador.

## Acesse

**[Abrir o SimulC](https://lucas-lms.github.io/SimulC/)** · [Código-fonte](https://github.com/Lucas-LMS/SimulC)

> O primeiro deploy pelo GitHub Actions pode levar alguns minutos depois que o Pages for ativado nas configurações do repositório.

## O que dá para fazer

- Cadastrar clientes e suas preferências, com informações mantidas no dispositivo.
- Consultar e filtrar um catálogo inicial de 112 referências de unidades.
- Montar cenários Caixa com dados de financiamento GPM/PRICE informados pelo consultor.
- Conferir ato, parcelas mensais e anuais, datas, arredondamentos e diferenças do fluxo.
- Comparar o fluxo Caixa com uma opção de Tabela Direta, com saldo pós-chaves explicitado.
- Importar tabelas em PDF ou imagem para revisão; valores detectados permanecem como rascunho.
- Guardar simulações, gerar uma conferência interna e preparar uma mensagem para WhatsApp.
- Exportar e restaurar cópias de segurança do espaço de trabalho.

## Privacidade e uso

A publicação é estática e não inclui banco de dados ou sincronização entre dispositivos. Clientes, simulações, documentos importados e preferências ficam no `localStorage` e no armazenamento do navegador usado para guardar arquivos. Eles não são enviados por este aplicativo a um servidor. Limpar os dados do navegador pode removê-los; exporte um backup para conservar uma cópia.

O catálogo incluído no código é uma referência fornecida em **novembro de 2026**. Preços, disponibilidade, unidade, campanha e cronograma podem mudar; confirme tudo na tabela e no espelho oficial antes de apresentar uma proposta. O simulador organiza premissas informadas e não calcula aprovação, subsídio, uso de FGTS nem condições bancárias definitivas.

## Rodar localmente

Requisitos: Node.js 24 ou mais recente e pnpm 11.25.0.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Abra a URL local exibida pelo Vite. Para gerar a versão usada pelo GitHub Pages:

```bash
pnpm build:pages
pnpm preview
```

## GitHub Pages

O workflow em `.github/workflows/pages.yml` publica `dist/` quando há um push para `main` ou execução manual. Em **Settings → Pages**, selecione **GitHub Actions** como fonte de publicação. O endereço do projeto é `https://lucas-lms.github.io/SimulC/`.

## Estrutura

```text
client/src/
├── components/   # telas e componentes da aplicação
├── data/         # referências iniciais do catálogo
├── lib/          # cálculos, calendário, armazenamento e importação
├── pages/        # mesa principal
├── index.html
└── main.tsx
```

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).

