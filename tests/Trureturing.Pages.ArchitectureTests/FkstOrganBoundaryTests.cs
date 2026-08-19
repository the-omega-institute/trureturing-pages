using System.Text.RegularExpressions;
using Xunit;

namespace Trureturing.Pages.ArchitectureTests;

public sealed class FkstOrganBoundaryTests
{
    private static readonly string[] ForbiddenCrossOrganTokens =
    [
        "fkst-ops",
        "trureturing-fkst-packages",
        "Golden/Frozen",
        "skills/codex",
        "docs/develop/spec",
        "github.com",
        "http://",
        "https://",
        "\"git\"",
        "\"gh\"",
        "\"curl\"",
    ];

    [Fact]
    public void Host_package_is_repository_local_and_framework_agnostic()
    {
        var repositoryRoot = FindRepositoryRoot();
        var packageRoot = Path.Combine(
            repositoryRoot,
            ".fkst",
            "local-packages",
            "pages-publish");
        var luaFiles = Directory.GetFiles(packageRoot, "*.lua", SearchOption.AllDirectories);

        Assert.NotEmpty(luaFiles);
        var source = string.Join(
            "\n",
            luaFiles.Order(StringComparer.Ordinal)
                .Select(path => StripLineComments(File.ReadAllText(path))));

        foreach (var token in ForbiddenCrossOrganTokens)
        {
            Assert.False(
                source.Contains(token, StringComparison.OrdinalIgnoreCase),
                $"The repository-local FKST package must not reference cross-organ/framework detail '{token}'.");
        }

        Assert.Single(Regex.Matches(source, @"\bexec_argv\s*\(").Cast<Match>());
        var act = StripLineComments(File.ReadAllText(Path.Combine(
            packageRoot,
            "departments",
            "act",
            "main.lua")));
        foreach (var localPort in new[] { "pth.script", "pth.raw", "pth.out", "pth.snap" })
        {
            Assert.Contains(localPort, act, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void Core_logic_has_no_host_authority_calls()
    {
        var core = StripLineComments(File.ReadAllText(Path.Combine(
            FindRepositoryRoot(),
            ".fkst",
            "local-packages",
            "pages-publish",
            "core.lua")));

        foreach (var token in new[]
        {
            "file.read",
            "file.write",
            "file.exists",
            "exec_argv",
            "raise(",
            "with_lock(",
            "log.",
        })
        {
            Assert.DoesNotContain(token, core, StringComparison.Ordinal);
        }
    }

    private static string FindRepositoryRoot()
    {
        foreach (var start in new[]
        {
            new DirectoryInfo(Environment.CurrentDirectory),
            new DirectoryInfo(AppContext.BaseDirectory),
        })
        {
            for (var current = start; current is not null; current = current.Parent)
            {
                if (File.Exists(Path.Combine(current.FullName, "Trureturing.Pages.slnx")))
                {
                    return current.FullName;
                }
            }
        }

        throw new DirectoryNotFoundException("Could not locate the trureturing-pages repository root.");
    }

    private static string StripLineComments(string source) =>
        string.Join(
            "\n",
            source.Split('\n').Select(line =>
            {
                var comment = line.IndexOf("--", StringComparison.Ordinal);
                return comment < 0 ? line : line[..comment];
            }));
}
