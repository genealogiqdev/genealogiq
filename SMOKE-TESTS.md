> **Historical memory — retained on 2026-10-03.** This document records earlier intent, incidents or migration work. Current source/runtime contracts are in [AGENTS.md](AGENTS.md) and [HISTORY](docs/HISTORY.md). Commands, live resources, old statuses and numeric claims below are unverified as current behavior; do not replay historical cloud/data operations without checking the current code and task scope. Original content follows intact.

# Genealogiq — Smoke Tests (BMS → SEQ → APP)

Checklist manual de verificação rápida pós-refactor. Rode na ordem **BMS, SEQ, APP**.
Para cada item: execute a ação e confirme o resultado esperado. Marque `[x]` ao passar.

**Antes de começar (todas as apps):**

- [ ] App carrega sem erro no console do navegador (F12 → Console).
- [ ] Build de produção / preview Vercel sobe sem erro (`pnpm build` por app, se quiser validar local).
- [ ] Variáveis de ambiente por app presentes (cookie name, `AUTH_SECRET`, `DATABASE_URL`, `STRIPE_*`, `RESEND_API_KEY`, `AZURE_STORAGE_*`, `MEDIA_PUBLIC_BASE_URL`).

> Dica: use um navegador (ou perfil) separado por app — os cookies de sessão são
> distintos (`bms.`/`seq.`/`app.session-token`), então dá pra ficar logado nas três ao mesmo tempo.

---

## 1. BMS (back-office / admin)

### 1.1 Autenticação
- [ ] **Setup (primeiro acesso):** com banco sem usuários, `/` redireciona para `/setup`; criar o primeiro admin funciona e leva ao sign-in.
- [ ] Com usuários existentes, `/setup` redireciona para `/sign-in` (não deixa recriar admin).
- [ ] **Sign-in** com credenciais válidas entra no dashboard.
- [ ] Sign-in com senha errada falha com mensagem genérica (não revela se o e-mail existe).
- [ ] **Lockout:** 5 tentativas erradas bloqueiam a conta por ~15 min (mensagem de bloqueio).
- [ ] **Forgot password** envia e-mail; o link de **reset** abre e troca a senha; senha nova loga.
- [ ] **Verify email**: link de verificação confirma a conta; link inválido/expirado mostra erro.
- [ ] **Sign-out** encerra a sessão; rota protegida passa a redirecionar para sign-in.
- [ ] Acessar uma rota `/(protected)/...` deslogado redireciona para sign-in.

### 1.2 Dashboard e navegação
- [ ] `/dashboard` carrega com os widgets/contadores.
- [ ] Menu lateral navega para todas as seções sem 404.

### 1.3 Cadastros (records)
- [ ] **Customers:** listar, criar (`/customers/new`), abrir detalhe (`/customers/[id]`), editar, salvar.
- [ ] No formulário de endereço: busca por **CEP/ZIP** preenche rua/bairro/cidade/estado (BR, US, MX).
- [ ] **Suppliers:** listar, criar, abrir/editar.
- [ ] **Products** e **Services:** listar (criar/editar conforme o fluxo).
- [ ] **Packages:** listar, criar, abrir/editar.
- [ ] **Subscriptions:** listar, criar (`/subscriptions/new`), abrir/editar — confirmar que `max_profiles`, `term_length` e `price` são **obrigatórios** (não aceita vazio).

### 1.4 Categorias
- [ ] Categorias de **customers**, **products**, **services**, **suppliers**: listar; criar/editar nas que têm `new`/`[id]`.

### 1.5 Vendas
- [ ] **Manual sales:** criar venda (`/sales/manual-sales/new`); valor inválido/negativo é rejeitado; venda válida persiste.
- [ ] **Discount coupons:** listar, criar, abrir/editar; cupom aplica às packages corretas.
- [ ] **Sales reports:** relatório carrega e filtra.

### 1.6 Compras e estoque
- [ ] **Purchasing** (products / services): fluxo de compra carrega e registra.
- [ ] **Inventory** (products / subscriptions): listagem reflete o estoque.

### 1.7 Physical QR
- [ ] `/physical-qr`: listar; **new** gera/registra; abrir `[id]` mostra detalhe.

### 1.8 Finance
- [ ] `/finance` carrega os números sem erro.

### 1.9 Perfil e sistema
- [ ] **Profile:** abrir, editar, **upload de avatar** (`/api/profile/upload`) aceita imagem válida e rejeita arquivo inválido/grande.
- [ ] **System → Company:** editar dados da empresa e salvar.
- [ ] **System → Users:** listar, criar (`/users/new`), abrir/editar; novo usuário recebe e-mail/loga.
- [ ] Autocomplete de nome de entidade (`/api/entity-name`) responde nos formulários.

---

## 2. SEQ (Sequoia — portal multi-tenant para funerárias)

> Ponto-chave de segurança: **isolamento de tenant**. Confirme que um usuário de um
> tenant nunca vê/edita dados de outro.

### 2.1 Autenticação
- [ ] **Sign-in** de um usuário de tenant entra no dashboard do tenant correto.
- [ ] Senha errada → erro genérico; **lockout** após 5 tentativas.
- [ ] **Forgot/reset password** e **verify email** funcionam.
- [ ] **Sign-out** encerra a sessão; rota protegida redireciona.

### 2.2 Dashboard e navegação
- [ ] `/dashboard` carrega com dados **apenas do tenant logado**.
- [ ] Menu navega para todas as seções sem 404.

### 2.3 Cadastros (records)
- [ ] **Customers:** listar, criar, abrir/editar; busca de CEP/ZIP no endereço.
- [ ] **Memorialized:** a partir de um customer, criar memorializado (`/customers/[id]/memorialized/new`); abrir `/memorialized/[id]`.
- [ ] **Suppliers / Products / Services:** listar e abrir/editar conforme o fluxo.

### 2.4 Categorias
- [ ] Categorias de customers / products / services / suppliers: listar e criar/editar.

### 2.5 Vendas e checkout
- [ ] `/sales`: criar venda; valor inválido rejeitado.
- [ ] **Checkout (Stripe):** iniciar checkout (`checkout.actions`); pagamento de teste conclui.
- [ ] **Webhook Stripe** (`/api/stripe/webhook`): após o pagamento, o pedido é marcado pago **uma única vez** (idempotente) e o item é provisionado.

### 2.6 Compras e estoque
- [ ] **Purchasing → Digital QR** e **Physical QR:** comprar/registrar.
- [ ] **Inventory → Digital QR / Physical QR / Products:** estoque reflete as compras.

### 2.7 QR codes
- [ ] Ações de QR (`qr-code.actions`) geram/associam códigos sem erro.
- [ ] Integração com APP-users (`/api/app-users`) resolve o consumidor vinculado.

### 2.8 Finance, perfil e sistema
- [ ] `/finance` carrega.
- [ ] **Profile:** editar e **upload de avatar** (válido aceito, inválido rejeitado).
- [ ] **System → Company / Users:** editar empresa; listar/criar/editar usuários do tenant.

### 2.9 Segurança (spot-check de tenant)
- [ ] Logado no Tenant A, tentar abrir por URL o `[id]` de um customer/memorializado/guardião do Tenant B → **negado** (404/403), não vaza dados.

---

## 3. APP (consumidor B2C)

### 3.1 Autenticação
- [ ] **Sign-up** cria conta; e-mail de verificação chega; **verify email** confirma.
- [ ] **Sign-in** entra na home; senha errada → erro genérico; **lockout** após 5 tentativas.
- [ ] **Forgot/reset password** funciona.
- [ ] **Sign-out** encerra a sessão; rota protegida redireciona.

### 3.2 Home, busca e mensagens
- [ ] `/home` carrega: greeting, recém-vistos, favoritos, memoriais.
- [ ] **Busca** (`/api/search`) retorna perfis/memoriais.
- [ ] **Messages** (`/messages`): listar e enviar mensagem.

### 3.3 Perfil próprio e edição
- [ ] `/profile` (próprio) abre; **editar** (`/profile/[id]/edit`) salva.
- [ ] **Bio:** ver, editar (`/bio/edit`), **upload** de mídia (`/api/bio/upload`).
- [ ] **Gallery:** ver, editar, **upload** de imagens (`/api/gallery/upload`); inválido rejeitado.
- [ ] **Geolocation:** ver, editar; sugestões de endereço (`/api/address/suggestions`) e places (`/api/geolocation/places`) respondem; **upload** (`/api/geolocation/upload`).
- [ ] **Favorites:** favoritar/desfavoritar reflete na lista.

### 3.4 Memorializados e árvore
- [ ] **Memorialized:** ver (`/profile/[id]/memorialized`) e criar (`/memorialized/new`).
- [ ] **Family tree** (`/profile/[id]/tree`): carrega o layout, adiciona/edita parentesco.
- [ ] **Fotos na árvore:** criar pessoa e pet com foto; trocar/remover a foto ao editar; confirmar fallback para iniciais quando a URL falha.
- [ ] A foto aparece nos nós e detalhes da árvore em desktop/mobile, inclusive para pets e memoriais, sem alterar o layout.
- [ ] **Tributes:** ver, editar (`/tributes/edit`), **upload** (`/api/tribute/upload`); **moderar** (`/tributes/moderate`) só pelo dono/guardião.

### 3.5 Guardianship e family requests
- [ ] **Family requests** (`/family-requests`): enviar e aceitar/recusar pedido.
- [ ] **Co-guardianship:** guardião consegue gerenciar; não-guardião **não** (apenas status corretos podem gerenciar o perfil).

### 3.6 Assinaturas, QR e billing
- [ ] **Subscriptions** (`/subscriptions`): ver planos; iniciar assinatura (Stripe).
- [ ] **Webhook Stripe** (`/api/stripe/webhook`): assinatura/compra é provisionada **uma única vez**.
- [ ] **Billing → QR code** (`/billing/qr-code`) e **profile QR** (`/profile/[id]/qr-code`) geram o código.
- [ ] **Scan público** (`/qr/[genCode]`): abre o perfil/memorial correto; **analytics de scan** (`/api/analytics/qr-scan`) registra o acesso.

### 3.7 Segurança (spot-check de IDOR)
- [ ] Logado como Usuário A, tentar por URL editar bio/gallery/tributes ou **moderar tributos** de um perfil de Usuário B que não é seu → **negado**.
- [ ] Tentar ler/editar a **árvore genealógica** de outro usuário por URL → **negado**.

---

## 4. Jornada ponta-a-ponta — QR físico + gen-code (cadastro e ativação no APP)

> Fluxo do comprador do QR físico: o código é **provisionado** no back-office (BMS/SEQ)
> e **ativado** pelo consumidor no APP, escaneando o QR (ou abrindo `/qr/<gen-code>`).
> O gen-code é **case/hífen-insensível** (normalizado para maiúsculas, sem hífen).

### 4.1 Provisionamento (origem do código — BMS/SEQ)
- [ ] Um QR físico **vendido** gera uma licença com `genCode` e status **AVAILABLE** (ainda não ativada).
- [ ] O gen-code impresso/entregue corresponde à licença (`/qr/<gen-code>` resolve essa licença).

### 4.2 Primeiro acesso pelo código (usuário novo / deslogado)
- [ ] Abrir `/qr/<gen-code>` **deslogado** mostra a landing "Create a Memorial" com o código formatado e botões **Sign in** / **Create account**.
- [ ] Variações do mesmo código abrem a **mesma** licença: `abc-123`, `ABC123`, `AbC123`.
- [ ] **Create account** vai ao sign-up com `callbackUrl=/qr/<gen-code>`; após verificar e-mail e logar, **retorna para `/qr/<gen-code>`**.
- [ ] **Sign in** (conta já existente) também retorna para `/qr/<gen-code>` após o login.

### 4.3 Ativação (logado, código AVAILABLE)
- [ ] A página mostra o formulário **Activate Memorial**.
- [ ] Preencher dados do memorializado (nome, gênero, datas e locais de nascimento/falecimento) e **upload de avatar** (válido aceito, inválido/grande rejeitado).
- [ ] Salvar **cria o memorial**, vincula o usuário logado como **guardião**, marca a licença **ACTIVATED** (com `activatedAt`) e redireciona para o memorial.
- [ ] O novo memorial aparece em `/profile/<user>/memorialized` e é editável pelo guardião.

### 4.4 Re-scan e casos de borda
- [ ] Re-escanear um código **já ativado** redireciona direto ao perfil do memorial (`/profile/<appUserId>`), sem novo formulário.
- [ ] Gen-code **inexistente** → **404**.
- [ ] Tentar ativar um código já ativado → mensagem "already been activated".
- [ ] **Corrida** (dois ativadores simultâneos do mesmo código): só um cria o memorial; o outro recebe "This code was just activated. Please try again." _(coberto por teste automatizado — #37.)_

### 4.5 Segurança
- [ ] Depois de ativado, **apenas o guardião** edita o memorial; outro usuário tentando por URL → **negado**.

---

## Critério de aprovação

O smoke passa se: login/logout e recuperação de senha funcionam nas 3 apps; cada
seção principal carrega e a operação básica (criar/editar/listar) persiste; uploads
aceitam válido e rejeitam inválido; checkouts/webhooks Stripe provisionam uma única
vez; a **ativação do QR físico + gen-code** cadastra/loga o comprador e cria o memorial
uma única vez; e os spot-checks de tenant/IDOR **negam** acesso cruzado.

Qualquer falha → anotar app, rota, passo e mensagem de erro (Console + Network) antes de seguir.
