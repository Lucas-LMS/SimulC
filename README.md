# SimulC · Cury Fluxo

Uma mesa de trabalho para transformar dados de clientes e referências de empreendimentos em simulações imobiliárias claras, revisáveis e fáceis de apresentar.

<p align="center">
  <a href="https://lucas-lms.github.io/SimulC/"><strong>Abrir o simulador</strong></a>
  ·
  <a href="https://github.com/Lucas-LMS/SimulC">Código-fonte</a>
</p>

![Identidade visual do Cury Fluxo](client/src/curyfluxo-logo.svg)

## O que você pode fazer

- Manter perfis de clientes, preferências e dados de PRICE/GPM.
- Consultar e filtrar o catálogo de unidades e empreendimentos.
- Montar fluxos de pagamento Caixa e Tabela Direta, revisar datas e conferir totais.
- Comparar simulações, registrar premissas e preparar mensagens para WhatsApp.
- Gerar recomendações que cruzam região, tipologia, entrega e dados financeiros informados.
- Importar tabelas em PDF/imagem e colar imagens de simulações PRICE/GPM para extração local e revisão.
- Exportar e restaurar backups JSON.
- Opcionalmente, sincronizar o espaço de trabalho privado entre dispositivos com Google e Firebase.

## Privacidade e sincronização

Sem conexão com Firebase, o espaço de trabalho permanece no armazenamento local do navegador. Ao conectar uma conta Google em uma implantação configurada, os dados são gravados no Cloud Firestore sob `users/{uid}/workspaces/main`. As regras de [Firestore](firestore.rules) permitem leitura e gravação somente quando o UID autenticado corresponde ao UID do documento. O catálogo e os arquivos de código são públicos; os dados dos clientes não são publicados no repositório.

A configuração do Firebase é opcional e não contém chave de servidor. Os quatro valores `VITE_FIREBASE_*` são configuração do cliente Web. Restrinja a chave de API ao domínio do app no Google Cloud e mantenha as regras publicadas. O Firestore tem limites por documento; esta aplicação interrompe a sincronização quando o espaço de trabalho ultrapassa 900 KB. PDFs e imagens originais não são enviados nem guardados no Firestore.

## Configurar a sincronização Firebase

1. Crie um projeto Firebase e registre um app Web.
2. Ative **Authentication → Google** e inclua `lucas-lms.github.io` nos domínios autorizados do Authentication.
3. Crie um banco **Cloud Firestore**. Publique as regras deste repositório (`firestore.rules`) no banco antes de gravar qualquer dado.
4. Em **Settings → Secrets and variables → Actions → Variables** no GitHub, crie estas variáveis com os valores do app Web Firebase:

   | Variável | Campo Firebase |
   | --- | --- |
   | `FIREBASE_API_KEY` | `apiKey` |
   | `FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `FIREBASE_PROJECT_ID` | `projectId` |
   | `FIREBASE_APP_ID` | `appId` |

5. Execute novamente o workflow **Deploy to GitHub Pages** em **Actions**. Depois, no simulador, abra **Dados e backup** e conecte a conta Google.

Para desenvolvimento local, copie `.env.example` para `.env.local`, preencha as mesmas quatro variáveis e execute `pnpm dev`. O arquivo `.env.local` não deve ser commitado. Uma nova conta começa usando os dados deste navegador; quando já houver dados na nuvem, o app pergunta antes de substituir o espaço local.

O Firestore oferece uma cota sem custo para projetos elegíveis, sujeita aos limites e às condições atuais do Google. Veja [preços e cotas do Firestore](https://firebase.google.com/docs/firestore/pricing). Autenticação Google: [documentação oficial](https://firebase.google.com/docs/auth/web/google-signin).

## Sobre cálculos e referências

Os valores de catálogo são referências fornecidas em **novembro de 2026** e podem ficar desatualizados. Confirme preço, disponibilidade, unidade, campanha e entrega na tabela e no espelho oficial antes de apresentar uma proposta.

Projeções de PRICE para outras unidades são proporcionais ao preço-base salvo e aparecem como estimativas. O simulador não calcula aprovação, subsídio, elegibilidade de FGTS ou condição bancária definitiva. Extração de PDF/imagem é feita no navegador e precisa ser conferida por uma pessoa.

## Rodar localmente

Requisitos: Node.js 24 ou mais recente e pnpm 11.25.0.

```bash
pnpm install --frozen-lockfile
pnpm dev
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
├── components/   # telas e componentes
├── data/         # catálogo inicial
├── lib/          # cálculos, armazenamento, importação e Firebase
├── pages/        # aplicação principal
└── cury.css       # identidade visual e temas claro/escuro
firestore.rules   # acesso privado por conta autenticada
```

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).
