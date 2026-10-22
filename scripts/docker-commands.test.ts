// Docker 困ったとき辞書のコマンド検査（docker-commands.ts）の解析部分。
// 実際の docker との突き合わせは npm run test:snippets（docker-recipe-snippets.ts）で行う。
import { describe, expect, it } from 'vitest';
import { helpOptions, isUsageOf, missingDockerOptions, parseDockerLines } from './docker-commands';

const RUN_HELP = `Usage:  docker run [OPTIONS] IMAGE [COMMAND] [ARG...]

Create and run a new container from an image

Options:
  -d, --detach                       Run container in background and
                                     print container ID
  -e, --env list                     Set environment variables
  -i, --interactive                  Keep STDIN open even if not attached
  -p, --publish list                 Publish a container's port(s) to
                                     the host
      --rm                           Automatically remove the container
                                     and its associated anonymous
                                     volumes when it exits
  -t, --tty                          Allocate a pseudo-TTY
  -v, --volume list                  Bind mount a volume
  -w, --workdir string               Working directory inside the container
`;

describe('parseDockerLines', () => {
  it('docker で始まる行のサブコマンドと引数を取り出す（# の行・docker 以外の行は対象外）', () => {
    const [a, b] = parseDockerLines(
      'docker compose logs -f app\n# docker system prune\nwsl --shutdown\ndocker ps -a',
    );
    expect(a).toMatchObject({ subcommand: ['compose', 'logs'], args: ['-f', 'app'] });
    expect(b).toMatchObject({ subcommand: ['ps'], args: ['-a'] });
  });

  it('引用符の中・パイプやリダイレクトの後ろはオプションと見なさない', () => {
    expect(parseDockerLines('docker ps --format "{{.Names}} --x"')[0]?.args).toEqual([
      '--format',
      'ARG',
    ]);
    expect(
      parseDockerLines('docker compose exec -T db pg_dump -U app > backup.sql')[0]?.args,
    ).toEqual(['-T', 'db', 'pg_dump', '-U', 'app']);
    expect(parseDockerLines('docker images | grep --x')[0]?.args).toEqual([]);
  });

  it('入れ子のサブコマンド（volume rm・system prune）', () => {
    expect(parseDockerLines('docker volume rm myapp_db')[0]?.subcommand).toEqual(['volume', 'rm']);
    expect(parseDockerLines('docker system prune -a')[0]?.subcommand).toEqual(['system', 'prune']);
    expect(parseDockerLines('docker run -it node:22')[0]?.subcommand).toEqual(['run']);
  });
});

describe('helpOptions', () => {
  it('オプション名と、値を取るかを読み取る', () => {
    const options = helpOptions(RUN_HELP);
    expect(options.get('-d')).toBe(false);
    expect(options.get('--detach')).toBe(false);
    expect(options.get('-p')).toBe(true);
    expect(options.get('--rm')).toBe(false);
    expect(options.get('--workdir')).toBe(true);
    expect(options.has('--x')).toBe(false);
  });
});

describe('missingDockerOptions', () => {
  const check = (line: string) => missingDockerOptions(parseDockerLines(line)[0]!, RUN_HELP);

  it('表示にあるオプションは OK。値を取るオプションの次の語・最初の引数より後ろは検査しない', () => {
    expect(check('docker run --rm -it -p 8080:8080 -e A=1 -w /app node:22 npm -x --y')).toEqual([]);
    expect(check('docker run --workdir=/app -d node:22')).toEqual([]);
  });

  it('表示に無いオプション・まとめた 1 文字のうち無いものを見つける', () => {
    expect(check('docker run --rmm -itz node:22')).toEqual(['--rmm', '-z']);
    expect(check('docker run -d --no-such-option node:22')).toEqual(['--no-such-option']);
  });
});

describe('isUsageOf', () => {
  it('そのサブコマンドの使い方か（別名は最後の語で比べる）', () => {
    expect(isUsageOf(['run'], RUN_HELP)).toBe(true);
    expect(isUsageOf(['build'], 'Usage:  docker buildx build [OPTIONS] PATH | URL | -')).toBe(true);
    expect(isUsageOf(['builder', 'prune'], 'Usage:  docker buildx prune')).toBe(true);
  });

  it('存在しないサブコマンド（全体・親の使い方が出る、エラーになる）は false', () => {
    expect(isUsageOf(['nosuch'], 'Usage:  docker [OPTIONS] COMMAND')).toBe(false);
    expect(isUsageOf(['volume', 'nosuch'], 'Usage:  docker volume COMMAND')).toBe(false);
    expect(isUsageOf(['compose', 'nosuch'], 'unknown docker command: "compose nosuch"')).toBe(
      false,
    );
  });
});
