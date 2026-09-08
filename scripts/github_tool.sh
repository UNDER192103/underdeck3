#!/usr/bin/env bash
set -e

if [ -z "${BASH_VERSION:-}" ]; then
  if command -v bash >/dev/null 2>&1; then
    exec bash "$0" "$@"
  fi

  echo "Erro: este script precisa ser executado com bash." >&2
  echo "Use: bash github_tool.sh" >&2
  exit 1
fi

MAIN_REPO="https://github.com/UNDER192103/underdeck3.git"
DEFAULT_BRANCH="main"
DEFAULT_FOLDER="underdeck3"

CYAN="\033[96m"
GREEN="\033[92m"
YELLOW="\033[93m"
RED="\033[91m"
RESET="\033[0m"

main_options=(
  "Push completo para GitHub"
  "Baixar tudo do GitHub"
  "Baixar escolhendo módulos"
  "Pull apenas dos módulos já baixados"
  "Pull completo baixando todos os módulos"
  "Sair"
)

main_actions=(
  "push"
  "clone_all"
  "clone_select"
  "pull_downloaded"
  "pull_all"
  "exit"
)

read_input() {
  local prompt="$1"
  local var_name="$2"
  local value=""

  if [[ -r /dev/tty ]]; then
    IFS= read -r -p "$prompt" value < /dev/tty
  else
    IFS= read -r -p "$prompt" value
  fi

  printf -v "$var_name" '%s' "$value"
}

pause_back() {
  local _unused=""
  read_input "Pressione Enter para voltar..." _unused
}

pause_continue() {
  local _unused=""
  read_input "Pressione Enter para continuar..." _unused
}

normalize_repo_url() {
  local url="$1"

  url="${url%.git}"
  url="${url%/}"
  url="${url/git@github.com:/https://github.com/}"

  echo "$url"
}

is_inside_main_repo() {
  local remote=""
  local current=""
  local expected=""

  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1

  remote="$(git remote get-url origin 2>/dev/null || true)"
  [[ -n "$remote" ]] || return 1

  current="$(normalize_repo_url "$remote")"
  expected="$(normalize_repo_url "$MAIN_REPO")"

  [[ "$current" == "$expected" ]]
}

is_main_repo_folder() {
  local folder="$1"
  local remote=""
  local current=""
  local expected=""

  [[ -d "$folder" ]] || return 1

  git -C "$folder" rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1

  remote="$(git -C "$folder" remote get-url origin 2>/dev/null || true)"
  [[ -n "$remote" ]] || return 1

  current="$(normalize_repo_url "$remote")"
  expected="$(normalize_repo_url "$MAIN_REPO")"

  [[ "$current" == "$expected" ]]
}

confirm_clone_location() {
  local confirm=""

  if is_inside_main_repo; then
    echo -e "${YELLOW}Aviso: você já está dentro do Under Deck.${RESET}"
    echo "Para atualizar este projeto, use uma das opções de pull."
    echo "Baixar novamente aqui pode criar um clone dentro de outro clone."
    echo
    read_input "Continuar mesmo assim? [s/N]: " confirm

    case "$confirm" in
      s|S|y|Y|yes|YES|sim|SIM) return 0 ;;
      *) return 1 ;;
    esac
  fi

  return 0
}

validate_target_folder() {
  local folder="$1"

  if [[ -z "$folder" || "$folder" == "." || "$folder" == "./" ]]; then
    echo -e "${RED}Erro: informe uma pasta válida. Não use '.' como destino.${RESET}"
    return 1
  fi

  if [[ -e "$folder" ]]; then
    echo -e "${RED}Erro: a pasta \"$folder\" já existe.${RESET}"
    return 1
  fi

  return 0
}

force_pull_main() {
  echo "Forcando sincronizacao do projeto principal com origin/$DEFAULT_BRANCH..."
  git fetch origin "$DEFAULT_BRANCH"
  git reset --hard "origin/$DEFAULT_BRANCH"
}

force_update_submodule() {
  local module_path="$1"
  git submodule update --init --recursive --force "$module_path"
}

force_update_all_submodules() {
  git submodule update --init --recursive --force
}

read_key() {
  local key

  if [[ -r /dev/tty ]]; then
    IFS= read -rsn1 key < /dev/tty || return 1
  else
    IFS= read -rsn1 key || return 1
  fi

  if [[ "$key" == $'\x1b' ]]; then
    if [[ -r /dev/tty ]]; then
      IFS= read -rsn2 key < /dev/tty || true
    else
      IFS= read -rsn2 key || true
    fi

    case "$key" in
      "[A") echo "up" ;;
      "[B") echo "down" ;;
      *) echo "other" ;;
    esac
  elif [[ "$key" == "" ]]; then
    echo "enter"
  elif [[ "$key" == " " ]]; then
    echo "space"
  else
    echo "$key"
  fi
}

main_menu() {
  local selection=0
  local key=""

  while true; do
    clear
    printf "\033[?25l"
    echo "======================================="
    echo "     Guild Builders - GitHub Helper"
    echo "======================================="
    echo
    echo "Use as setas [↑ / ↓] e Enter para escolher"
    echo

    for i in "${!main_options[@]}"; do
      if [[ "$i" == "$selection" ]]; then
        echo -e "  ${CYAN}➔  $((i + 1)) - ${main_options[$i]}${RESET}"
      else
        echo "     $((i + 1)) - ${main_options[$i]}"
      fi
    done

    echo
    key="$(read_key)"

    case "$key" in
      up)
        ((selection--)) || true
        if (( selection < 0 )); then
          selection=$((${#main_options[@]} - 1))
        fi
        ;;
      down)
        ((selection++)) || true
        if (( selection >= ${#main_options[@]} )); then
          selection=0
        fi
        ;;
      enter)
        printf "\033[?25h"
        clear
        run_action "${main_actions[$selection]}" || true
        ;;
    esac
  done
}

commit_and_push_current() {
  local msg="$1"
  local branch=""

  branch="$(git branch --show-current 2>/dev/null || true)"

  if [[ -z "$branch" ]]; then
    git switch "$DEFAULT_BRANCH" 2>/dev/null || git checkout "$DEFAULT_BRANCH" 2>/dev/null || true
    branch="$DEFAULT_BRANCH"
  fi

  git add -A

  if git diff --cached --quiet; then
    echo "Nada para commitar neste repositório."
  else
    git commit -m "$msg"
  fi

  git push -u origin "$branch"
}

push_process() {
  local custom_msg=""
  local version=""
  local msg=""

  echo "======================================="
  echo "      PUSH COMPLETO PARA GITHUB"
  echo "======================================="
  echo

  if [[ ! -d ".git" ]]; then
    echo -e "${RED}Erro: esta pasta não é um repositório Git.${RESET}"
    echo "Execute esse script dentro do projeto principal."
    pause_back
    return
  fi

  read_input "Mensagem do commit, ou Enter para usar versão do package.json: " custom_msg

  if [[ -z "$custom_msg" ]]; then
    if [[ -f "package.json" ]]; then
      version="$(grep -m1 '"version"' package.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)"
    else
      version=""
    fi

    if [[ -n "$version" ]]; then
      msg="pre-release version $version"
    else
      msg="update"
    fi
  else
    msg="$custom_msg"
  fi

  echo
  echo "Mensagem usada: \"$msg\""
  echo

  if [[ -f ".gitmodules" ]]; then
    echo "======================================="
    echo "      Salvando submodules primeiro"
    echo "======================================="
    echo

    while read -r _ path; do
      if [[ -e "$path/.git" ]]; then
        echo
        echo "---------------------------------------"
        echo "Submodule: $path"
        echo "---------------------------------------"

        (
          cd "$path"
          commit_and_push_current "$msg"
        )
      else
        if [[ -d "$path" ]]; then
          echo
          echo "Ignorando $path porque não parece estar inicializado como submodule."
        fi
      fi
    done < <(git config --file .gitmodules --get-regexp path)
  fi

  echo
  echo "======================================="
  echo "      Salvando projeto principal"
  echo "======================================="
  echo

  commit_and_push_current "$msg"

  echo
  echo -e "${GREEN}Processo concluído.${RESET}"
  pause_back
}

ask_post_command() {
  local post_cmd=""

  echo
  read_input "Comando após baixar, ex: pnpm install, ou Enter para ignorar: " post_cmd

  if [[ -n "$post_cmd" ]]; then
    echo
    echo "Executando: $post_cmd"
    eval "$post_cmd"
  fi
}

clone_all() {
  local folder=""

  echo "======================================="
  echo "      BAIXAR TUDO DO GITHUB"
  echo "======================================="
  echo

  if is_inside_main_repo; then
    echo -e "${YELLOW}VocÃª jÃ¡ estÃ¡ dentro do Under Deck.${RESET}"
    echo "Vou baixar/atualizar todos os submodules nesta pasta."
    echo

    if (
      force_pull_main
      git submodule sync --recursive
      force_update_all_submodules
      ask_post_command
    ); then
      echo
      echo -e "${GREEN}Download concluÃ­do.${RESET}"
    else
      echo
      echo -e "${YELLOW}Download parcial ou cancelado.${RESET}"
    fi

    pause_back
    return
  fi

  confirm_clone_location || {
    echo
    echo -e "${YELLOW}Operação cancelada.${RESET}"
    pause_back
    return
  }

  read_input "Nome da pasta para instalar, ou Enter para usar '$DEFAULT_FOLDER': " folder
  folder="${folder:-$DEFAULT_FOLDER}"

  if [[ -e "$folder" ]]; then
    if ! is_main_repo_folder "$folder"; then
      echo -e "${RED}Erro: a pasta \"$folder\" ja existe e nao parece ser o Under Deck.${RESET}"
      pause_back
      return
    fi

    echo
    echo -e "${YELLOW}A pasta \"$folder\" ja existe e e o Under Deck.${RESET}"
    echo "Vou entrar nela e baixar/atualizar todos os submodules."

    if (
      cd "$folder"
      force_pull_main
      git submodule sync --recursive
      force_update_all_submodules
      ask_post_command
    ); then
      echo
      echo -e "${GREEN}Download concluido.${RESET}"
    else
      echo
      echo -e "${YELLOW}Download parcial ou cancelado.${RESET}"
    fi

    pause_back
    return
  fi

  validate_target_folder "$folder" || {
    pause_back
    return
  }

  echo
  echo "Clonando projeto principal com todos os submodules..."
  git clone --recurse-submodules "$MAIN_REPO" "$folder"

  if (
    cd "$folder"
    ask_post_command
  ); then
    echo
    echo -e "${GREEN}Download concluído.${RESET}"
  else
    echo
    echo -e "${YELLOW}Download concluído, mas o comando pós-download falhou.${RESET}"
  fi

  pause_back
}

load_submodules() {
  modules=()

  if [[ ! -f ".gitmodules" ]]; then
    echo -e "${YELLOW}Nenhum .gitmodules encontrado.${RESET}"
    return 1
  fi

  while read -r _ path; do
    modules+=("$path")
  done < <(git config --file .gitmodules --get-regexp path)

  if [[ "${#modules[@]}" -eq 0 ]]; then
    echo -e "${YELLOW}Nenhum submodule encontrado no .gitmodules.${RESET}"
    return 1
  fi
}

select_submodules() {
  local selection=0
  local key=""
  local mark=""
  local selected_count=0
  local has_selected=0

  load_submodules || {
    pause_continue
    return 1
  }

  selected=()
  for _ in "${modules[@]}"; do
    selected+=(0)
  done

  while true; do
    clear
    printf "\033[?25l"
    echo "======================================="
    echo "      Selecionar Submodules"
    echo "======================================="
    echo
    echo "Use [↑ / ↓] para navegar"
    echo "Use [Espaço] para marcar/desmarcar"
    echo "Use [A] para marcar todos"
    echo "Use [N] para limpar seleção"
    echo "Use [Enter] para baixar os selecionados"
    echo "Use [Q] para cancelar e voltar"
    echo

    for i in "${!modules[@]}"; do
      mark=" "
      [[ "${selected[$i]}" == "1" ]] && mark="X"

      if [[ "$i" == "$selection" ]]; then
        echo -e "  ${CYAN}➔  [$mark] $((i + 1)) - ${modules[$i]}${RESET}"
      else
        echo "     [$mark] $((i + 1)) - ${modules[$i]}"
      fi
    done

    echo
    key="$(read_key)"

    case "$key" in
      up)
        ((selection--)) || true
        if (( selection < 0 )); then
          selection=$((${#modules[@]} - 1))
        fi
        ;;
      down)
        ((selection++)) || true
        if (( selection >= ${#modules[@]} )); then
          selection=0
        fi
        ;;
      space)
        if [[ "${selected[$selection]}" == "1" ]]; then
          selected[$selection]=0
        else
          selected[$selection]=1
        fi
        ;;
      A|a)
        for i in "${!selected[@]}"; do
          selected[$i]=1
        done
        ;;
      N|n)
        for i in "${!selected[@]}"; do
          selected[$i]=0
        done
        ;;
      Q|q)
        printf "\033[?25h"
        clear
        echo -e "${YELLOW}Seleção de submodules cancelada.${RESET}"
        return 1
        ;;
      enter)
        selected_count=0

        for i in "${!selected[@]}"; do
          if [[ "${selected[$i]}" == "1" ]]; then
            ((selected_count++)) || true
          fi
        done

        if (( selected_count == 0 )); then
          printf "\033[?25h"
          clear
          echo -e "${RED}Selecione pelo menos um submodule para continuar.${RESET}"
          echo
          pause_continue
          continue
        fi

        printf "\033[?25h"
        clear
        echo "======================================="
        echo "      Baixando submodules selecionados"
        echo "======================================="
        echo

        has_selected=0

        for i in "${!modules[@]}"; do
          if [[ "${selected[$i]}" == "1" ]]; then
            has_selected=1
            echo
            echo "Baixando: ${modules[$i]}"
            force_update_submodule "${modules[$i]}"
          fi
        done

        if [[ "$has_selected" == "1" ]]; then
          return 0
        fi

        return 1
        ;;
    esac
  done
}

clone_select() {
  local folder=""

  echo "======================================="
  echo "      BAIXAR ESCOLHENDO MÓDULOS"
  echo "======================================="
  echo

  if is_inside_main_repo; then
    echo -e "${YELLOW}Voce ja esta dentro do Under Deck.${RESET}"
    echo "Vou baixar/atualizar os submodules selecionados nesta pasta."
    echo

    if (
      force_pull_main
      git submodule sync --recursive
      select_submodules
      ask_post_command
    ); then
      echo
      echo -e "${GREEN}Download concluido.${RESET}"
    else
      echo
      echo -e "${YELLOW}Download parcial ou cancelado.${RESET}"
    fi

    pause_back
    return
  fi

  confirm_clone_location || {
    echo
    echo -e "${YELLOW}Operação cancelada.${RESET}"
    pause_back
    return
  }

  read_input "Nome da pasta para instalar, ou Enter para usar '$DEFAULT_FOLDER': " folder
  folder="${folder:-$DEFAULT_FOLDER}"

  if [[ -e "$folder" ]]; then
    if ! is_main_repo_folder "$folder"; then
      echo -e "${RED}Erro: a pasta \"$folder\" ja existe e nao parece ser o Under Deck.${RESET}"
      pause_back
      return
    fi

    echo
    echo -e "${YELLOW}A pasta \"$folder\" ja existe e e o Under Deck.${RESET}"
    echo "Vou entrar nela e baixar/atualizar os submodules selecionados."

    if (
      cd "$folder"
      force_pull_main
      git submodule sync --recursive
      select_submodules
      ask_post_command
    ); then
      echo
      echo -e "${GREEN}Download concluido.${RESET}"
    else
      echo
      echo -e "${YELLOW}Download parcial ou cancelado.${RESET}"
    fi

    pause_back
    return
  fi

  validate_target_folder "$folder" || {
    pause_back
    return
  }

  echo
  echo "Clonando apenas o projeto principal..."
  git clone "$MAIN_REPO" "$folder"

  if (
    cd "$folder"
    select_submodules
    ask_post_command
  ); then
    echo
    echo -e "${GREEN}Download concluído.${RESET}"
  else
    echo
    echo -e "${YELLOW}Download parcial ou cancelado.${RESET}"
    echo "A pasta criada foi: $folder"
    echo "Se não quiser manter esse clone parcial, remova essa pasta manualmente."
  fi

  pause_back
}

pull_downloaded() {
  local has_initialized=0
  local status_commit=""
  local module_path=""
  local first_char=""

  echo "======================================="
  echo "  PULL APENAS DOS MÓDULOS JÁ BAIXADOS"
  echo "======================================="
  echo

  if [[ ! -d ".git" ]]; then
    echo -e "${RED}Erro: esta pasta não é um repositório Git.${RESET}"
    pause_back
    return
  fi

  echo "Atualizando projeto principal..."
  if ! force_pull_main; then
    echo
    echo -e "${RED}Erro: nao foi possivel atualizar o projeto principal.${RESET}"
    echo "A sincronizacao forcada falhou. Verifique conexao, permissao ou estado do repositorio."
    pause_back
    return
  fi

  if [[ ! -f ".gitmodules" ]]; then
    echo
    echo -e "${YELLOW}Nenhum .gitmodules encontrado.${RESET}"
    pause_back
    return
  fi

  echo
  echo "Sincronizando configuração dos submodules..."
  git submodule sync --recursive

  echo
  echo "Atualizando apenas submodules já baixados..."
  echo

  has_initialized=0

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue

    status_commit="$(echo "$line" | awk '{print $1}')"
    module_path="$(echo "$line" | awk '{print $2}')"
    first_char="${status_commit:0:1}"

    if [[ "$first_char" != "-" ]]; then
      has_initialized=1

      echo "---------------------------------------"
      echo "Atualizando: $module_path"
      echo "---------------------------------------"
      force_update_submodule "$module_path"
      echo
    else
      echo "Ignorando não baixado: $module_path"
    fi
  done < <(git submodule status --recursive)

  if [[ "$has_initialized" == "0" ]]; then
    echo -e "${YELLOW}Nenhum submodule baixado/inicializado foi encontrado.${RESET}"
  fi

  echo
  echo -e "${GREEN}Pull dos módulos já baixados concluído.${RESET}"
  pause_back
}

pull_all() {
  echo "======================================="
  echo "  PULL COMPLETO BAIXANDO TODOS MÓDULOS"
  echo "======================================="
  echo

  if [[ ! -d ".git" ]]; then
    echo -e "${RED}Erro: esta pasta não é um repositório Git.${RESET}"
    pause_back
    return
  fi

  echo "Atualizando projeto principal..."
  if ! force_pull_main; then
    echo
    echo -e "${RED}Erro: nao foi possivel atualizar o projeto principal.${RESET}"
    echo "A sincronizacao forcada falhou. Verifique conexao, permissao ou estado do repositorio."
    pause_back
    return
  fi

  echo
  echo "Sincronizando submodules..."
  git submodule sync --recursive

  echo
  echo "Baixando/atualizando todos os submodules..."
  force_update_all_submodules

  echo
  echo -e "${GREEN}Pull completo concluído.${RESET}"
  pause_back
}

run_action() {
  case "$1" in
    push) push_process ;;
    clone_all) clone_all ;;
    clone_select) clone_select ;;
    pull_downloaded) pull_downloaded ;;
    pull_all) pull_all ;;
    exit)
      clear
      printf "\033[?25h"
      exit 0
      ;;
  esac
}

trap 'printf "\033[?25h"; exit' INT TERM

main_menu
