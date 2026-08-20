using System.Text.RegularExpressions;
using Xunit;

namespace Trureturing.Pages.ArchitectureTests;

public sealed class FkstOrganBoundaryTests
{
    private static readonly string[] ForbiddenCrossOrganTokens =
    [
        "fkst-ops",
        "fkst-substrate",
        "trureturing-fkst-packages",
        "deployment-set",
        "fkst.lock",
        "machine-profile",
        "substrate-ref",
        "engine_revision",
        "checkout_role",
        "Golden/Frozen",
        "skills/codex",
        "docs/develop/spec",
        "github.com",
        "http://",
        "https://",
        "\"git\"",
        "\"gh\"",
        "\"curl\"",
        "\"python3\"",
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
                .Select(path => StripFullLineComments(File.ReadAllText(path))));

        foreach (var token in ForbiddenCrossOrganTokens)
        {
            Assert.False(
                source.Contains(token, StringComparison.OrdinalIgnoreCase),
                $"The repository-local FKST package must not reference cross-organ, deployment, or engine-composition detail '{token}'.");
        }

        Assert.Single(Regex.Matches(source, @"\bexec_argv\s*\(").Cast<Match>());
        var act = StripFullLineComments(File.ReadAllText(Path.Combine(
            packageRoot,
            "departments",
            "act",
            "main.lua")));
        Assert.Contains(
            "\"dotnet\", pth.cli_dll",
            act,
            StringComparison.Ordinal);
        Assert.DoesNotContain(
            "\"dotnet\", \"run\"",
            act,
            StringComparison.Ordinal);
        Assert.DoesNotContain("--project", act, StringComparison.Ordinal);
        foreach (var localPort in new[]
        {
            "pth.cli_dll",
            "pth.raw",
            "pth.out",
            "pth.snap",
        })
        {
            Assert.Contains(localPort, act, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void Package_manifest_contains_only_package_local_configuration()
    {
        var manifest = File.ReadAllText(Path.Combine(
            FindRepositoryRoot(),
            ".fkst",
            "local-packages",
            "pages-publish",
            "fkst.toml"));

        Assert.Contains("kind = \"package\"", manifest, StringComparison.Ordinal);
        Assert.Contains("name = \"pages-publish\"", manifest, StringComparison.Ordinal);
        Assert.Contains("[code]", manifest, StringComparison.Ordinal);

        foreach (var token in new[]
        {
            "[deployment]",
            "[provider]",
            "lock_ref",
            "target_identity",
            "engine_revision",
            "[deployment.machine]",
            "github_write_enabled",
            "cadence_enabled",
            "checkout_role",
            "machine-profile",
            "deployment-set",
            "fkst.lock",
            "substrate-ref",
        })
        {
            Assert.DoesNotContain(token, manifest, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void Core_logic_has_no_host_authority_calls()
    {
        var core = StripFullLineComments(File.ReadAllText(Path.Combine(
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

    private static string StripFullLineComments(string source) =>
        string.Join(
            "\n",
            source.Split('\n').Where(line =>
                !line.TrimStart().StartsWith("--", StringComparison.Ordinal)));
}
