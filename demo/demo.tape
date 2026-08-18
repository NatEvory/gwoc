# VHS tape for the README demo GIF.
# Regenerate with: bun run build && vhs demo/demo.tape   (from the repo root)
# Requires: vhs (https://github.com/charmbracelet/vhs), ttyd, ffmpeg.
#
# The hidden setup creates a throwaway "remote" and a git URL rewrite so the
# visible demo can clone git@github.com:acme/acme-app.git fully offline.

Output demo/demo.gif

Set Shell "bash"
Set FontSize 20
Set Width 1200
Set Height 740
Set Padding 16
Set TypingSpeed 55ms

Hide
Type `export DEMO=/tmp/gwoc-demo && rm -rf $DEMO && mkdir -p $DEMO && export GIT_CONFIG_GLOBAL=$DEMO/gitconfig PATH="$PWD/dist:$PATH"`
Enter
Type `git config --global user.name Demo && git config --global user.email demo@example.invalid && git config --global init.defaultBranch main`
Enter
Type `mkdir -p $DEMO/remotes && git init -q $DEMO/seed && cd $DEMO/seed && echo '# acme-app' > README.md && mkdir src && echo 'export const hello = "world";' > src/app.ts && git add -A && git commit -qm 'initial commit'`
Enter
Type `git clone -q --bare $DEMO/seed $DEMO/remotes/acme-app.git && git config --global url."$DEMO/remotes/".insteadOf git@github.com:acme/`
Enter
Type `mkdir $DEMO/dev && cd $DEMO/dev && clear`
Enter
Show

Type "gwoc clone git@github.com:acme/acme-app.git"
Sleep 500ms
Enter
Sleep 1.5s

Type "cd acme-app && ls"
Sleep 500ms
Enter
Sleep 1.5s

Type "gwoc new feature-x"
Sleep 500ms
Enter
Sleep 1.5s

Type "cd feature-x"
Sleep 300ms
Enter
Sleep 800ms

Type `echo 'export const feature = true;' > src/feature.ts && git add -A && git commit -qm 'add feature'`
Sleep 500ms
Enter
Sleep 1s

Type "cd .. && gwoc list"
Sleep 500ms
Enter
Sleep 2s

Type "gwoc merge feature-x"
Sleep 500ms
Enter
Sleep 2s

Type "gwoc rm feature-x --prune"
Sleep 500ms
Enter
Sleep 3.5s
