# Meu Traço

Aplicativo web instalável (PWA), com interface mobile-first. A pessoa pode desenhar com o dedo ou uma caneta, manter uma transcrição editável separada e guardar páginas no armazenamento local do aparelho.

## Executar

Sirva esta pasta por HTTP local, por exemplo com Python:

```powershell
py -m http.server 8000
```

Abra `http://localhost:8000` no navegador. Para instalar no celular, publique a pasta em um endereço HTTPS e abra-o pelo navegador do aparelho. Use **Instalar app** no Android/Chrome. No iPhone/iPad, abra no Safari e toque em **Compartilhar → Adicionar à Tela de Início**. Depois da instalação, o app abre em janela própria e mantém os arquivos do caderno em armazenamento local.

## Publicar gratuitamente no GitHub Pages

1. Crie uma conta em [github.com](https://github.com/) ou entre na sua conta.
2. Crie um repositório **público** chamado `meu-traco`. Não é necessário adicionar README, licença ou `.gitignore` durante a criação.
3. Envie todos os arquivos desta pasta para a branch `main`, incluindo a pasta oculta `.github/workflows` e o arquivo `publish-pages.yml`. Você pode usar **Add file → Upload files** no site do GitHub.
4. No repositório, abra **Settings → Pages** e, em **Build and deployment → Source**, selecione **GitHub Actions**.
5. Abra a aba **Actions** e aguarde a execução **Publicar Meu Traço no GitHub Pages** terminar com sucesso.
6. Abra **Settings → Pages** para ver o endereço HTTPS gerado, geralmente `https://SEU-USUARIO.github.io/meu-traco/`. Acesse esse link no celular para instalar o app pelo navegador.

Cada novo envio de arquivos para a branch `main` publica a atualização automaticamente. As fotos, páginas e textos continuam guardados no aparelho; a publicação contém somente os arquivos do aplicativo.

## O que esta demonstração faz

- Captura traços com Pointer Events e os mantém como vetores para redesenhar a escrita.
- Guarda páginas e transcrições em `localStorage`; os dados não são enviados a um servidor.
- Organiza uma transcrição em tópicos usando pontuação e quebras de linha, sem alterar o texto original.
- Permite fotografar/enviar uma amostra de escrita, salva localmente no aparelho, mostra uma prévia manuscrita do texto digitado e oferece impressão.
- Mantém a interface disponível offline depois do primeiro carregamento bem-sucedido.

## Limites e próximos passos

Esta versão não reconhece escrita à mão nem inclui um modelo de IA. A transcrição é digitada ou colada pela pessoa; a organização é uma demonstração baseada em regras simples. A foto é uma referência visual e ainda não treina uma fonte pessoal: a prévia impressa usa as fontes manuscritas instaladas no aparelho, que podem não corresponder exatamente à caligrafia da pessoa. Para gerar uma fonte personalizada, será necessário integrar um processo de reconhecimento e criação de fonte, obter consentimento explícito para os exemplos de escrita e permitir revisar, exportar e apagar esses dados. A gramática original deve permanecer intacta por padrão, com sugestões sempre opcionais e separadas.
