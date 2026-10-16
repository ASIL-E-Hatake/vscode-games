// package.json の repository からリポジトリのページの URL を作る（VS Code API に依存しない）

/**
 * package.json の repository.url（例: https://github.com/owner/repo.git）から
 * リポジトリのページの URL を作る。GitHub 以外・形式が違う場合は undefined
 */
export function repositoryPage(repositoryUrl: string | undefined): string | undefined {
  const match = repositoryUrl?.match(
    /^(?:git\+)?https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/,
  );
  return match ? `https://github.com/${match[1]}/${match[2]}` : undefined;
}
