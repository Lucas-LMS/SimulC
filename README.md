# SimulC · Cury Fluxo

Uma mesa de trabalho para transformar dados de clientes e referências de empreendimentos em simulações imobiliárias claras, revisáveis e fáceis de apresentar.

<p align="center">
  <a href="https://lucas-lms.github.io/SimulC/"><strong>Abrir o simulador</strong></a>
  ·
  <a href="https://github.com/Lucas-LMS/SimulC">Código-fonte</a>
</p>

![Identidade visual do Cury Fluxo](client/src/curyfluxo-logo.svg)

## O que você pode fazer

- **Perfis de clientes organizados**: manter dados pessoais, renda, capacidade, FGTS, preferências e referências de PRICE/GPM com histórico de simulações vinculadas.
- **Catálogo de empreendimentos**: consultar, filtrar, ordenar (A–Z, preço, entrega), comparar até 5 unidades e versionar tabelas.
- **Simulador de fluxo visual**: montar fluxos Caixa e Tabela Direta com atalhos rápidos de ato/anuais, gráficos interativos (composição do preço, comprometimento de renda e desembolso mês a mês até as chaves), Termômetro de Bolso & Evolução de Obra, estimativa de documentação RJ (ITBI + RGI) e simulador ilustrativo de sensibilidade ao INCC.
- **Modo Apresentação, PDF Editorial & Card PNG**: apresentar a proposta em tela limpa (com opção de ocultar a renda do cliente), salvar PDF A4 editorial com sua assinatura/CRECI, ou gerar e copiar um **Card PNG** (1080×1350) direto para o WhatsApp.
- **Comunicação flexível**: escolher modalidade no WhatsApp (`Ambas`, `Só Caixa` ou `Só Direta`), editar o texto livremente antes de enviar e assinar com seu perfil de corretor configurável (nome, CRECI e telefone).
- **Funil comercial & gestão de simulações**: acompanhar status (`Rascunho`, `Enviada`, `Negociação`, `Pasta`, `Fechada`), registrar próximo passo, filtrar por estágio, duplicar cenários e excluir simulações diretamente no painel.
- **Recomendações inteligentes**: cruzar região, tipologia, entrega e dados financeiros informados.
- **Importação local de tabelas e GPM**: extrair texto/OCR de PDFs e imagens raster no navegador com revisão obrigatória.
- **Portabilidade e nuvem privada**: exportar/restaurar backups JSON, contar com cópias automáticas locais e sincronizar opcionalmente entre dispositivos com Google e Firebase.

## Privacidade e sincronização

Sem conexão com Firebase, o espaço de trabalho permanece 100% no armazenamento local do navegador (inclusive offline). Ao conectar uma conta Google em uma implantação configurada, os dados são gravados no Cloud Firestore sob `users/{uid}/workspaces/main`. As regras de [Firestore](firestore.rules) restringem leitura e gravação somente ao documento `main` do UID autenticado e validam a estrutura permitida. O catálogo e os arquivos de código são públicos; os dados dos clientes não são publicados no repositório.

A configuração do Firebase está no cliente Web (`client/src/lib/firebase.ts`); os valores usados ali são próprios para apps Web e não são chaves de servidor. As regras do Firestore, e não a ocultação desses valores, protegem os dados. Restrinja a chave de API ao domínio do app no Google Cloud e mantenha as regras publicadas. O Firestore tem limites por documento; esta aplicação trunca textos brutos de OCR na sincronização e interrompe o envio quando o espaço de trabalho ultrapassa 900 KB. PDFs e imagens originais não são enviados nem guardados no Firestore.

## Configurar a sincronização Firebase

1. Crie um projeto Firebase e registre um app Web.
2. Ative **Authentication → Google** e inclua `lucas-lms.github.io` nos domínios autorizados do Authentication.
3. Crie um banco **Cloud Firestore**. Publique as regras deste repositório (`firestore.rules`) no banco antes de gravar qualquer dado.
4. A configuração do app Web já está vinculada no código. Se trocar de projeto, atualize os valores em `client/src/lib/firebase.ts`; alternativamente, o workflow aceita os valores equivalentes em variáveis `VITE_FIREBASE_*` do GitHub Actions.
5. No simulador, abra **Dados e backup** e conecte a conta Google. Na primeira conexão, confirme se deseja enviar os dados locais ou carregar/substituir os dados da nuvem.

Para desenvolvimento local, copie `.env.example` para `.env.local`, preencha as mesmas quatro variáveis e execute `pnpm dev`. O arquivo `.env.local` não deve ser commitado.

## Sobre cálculos e referências

Os valores de catálogo são referências fornecidas em **novembro de 2026** e podem ficar desatualizados. Confirme preço, disponibilidade, unidade, campanha e entrega na tabela e no espelho oficial antes de apresentar uma proposta.

Projeções de PRICE para outras unidades são proporcionais ao preço-base salvo e aparecem como estimativas. O simulador não calcula aprovação, subsídio, elegibilidade de FGTS ou condição bancária definitiva. Extração de PDF/imagem é feita no navegador e precisa ser conferida por uma pessoa.

## Rodar localmente

Requisitos: Node.js 24 ou mais recente e pnpm 11.25.0.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Verificação de tipos e testes automatizados:

```bash
pnpm typecheck
pnpm test
```

Para gerar a versão do GitHub Pages:

```bash
pnpm build:pages
pnpm preview
```

## Publicação

O workflow em `.github/workflows/pages.yml` constrói e publica `dist/` quando há push para `main`. O site está em [lucas-lms.github.io/SimulC](https://lucas-lms.github.io/SimulC/).

## Estrutura

```text
client/src/
├── components/   # telas e componentes (carregamento sob demanda)
├── data/         # catálogo inicial
├── lib/          # motor financeiro, cronograma, parsers, armazenamento e Firebase
│   └── __tests__/# suíte de testes unitários (Vitest)
├── pages/        # aplicação principal (shell, navegação, sincronização e configurações)
└── cury.css      # identidade visual, temas claro/escuro e folha de impressão/PDF
firestore.rules   # acesso privado por conta autenticada com validação de schema
```

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).
