using Xunit;

namespace Trureturing.Pages.ArchitectureTests;

public sealed class TruthConsumptionBoundaryTests
{
    [Fact]
    public void PagesIngressAndCoreOwnAViewPortAndNotTheUpstreamWire()
    {
        string root = FindRoot();
        string source = Path.Combine(root, "src");
        string text = string.Join("\n", new[] { "Trureturing.Pages.Core", "Trureturing.Pages.Cli" }
            .SelectMany(project => Directory.EnumerateFiles(
                Path.Combine(source, project), "*.cs", SearchOption.AllDirectories))
            .OrderBy(path => path, StringComparer.Ordinal)
            .Select(File.ReadAllText));

        string normalized = Normalize(text);
        foreach (string token in ForbiddenUpstreamTokens)
        {
            Assert.DoesNotContain(token, normalized, StringComparison.Ordinal);
        }

        Assert.Contains(PagesPortSchema, text, StringComparison.Ordinal);
    }

    [Fact]
    public void RepositoryHasNoAbsoluteLocalPackageFeed()
    {
        string root = FindRoot();
        Assert.False(File.Exists(Path.Combine(root, "nuget.config")));

        foreach (string path in Directory.EnumerateFiles(
            root,
            "*",
            SearchOption.AllDirectories))
        {
            if (Path.GetFileName(path) == "TruthConsumptionBoundaryTests.cs" ||
                path.Contains($"{Path.DirectorySeparatorChar}.git{Path.DirectorySeparatorChar}",
                    StringComparison.Ordinal) ||
                path.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}",
                    StringComparison.Ordinal) ||
                path.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}",
                    StringComparison.Ordinal))
            {
                continue;
            }

            string text;
            try
            {
                text = File.ReadAllText(path);
            }
            catch
            {
                continue;
            }

            Assert.DoesNotContain("/Users/", text, StringComparison.Ordinal);
            Assert.DoesNotContain("\\Users\\", text, StringComparison.Ordinal);
        }
    }

    private const string PagesPortSchema = "pages-truth-release-port.v1";

    private static readonly string[] ForbiddenUpstreamTokens =
    [
        "stratalinttruthgraph", "stratalinttruthexport",
        "truthgraphv1", "truthexportv1", "truthreleasev1",
        "trureturingtruth", "readtruthgraph", "readtruthexport",
        "frozenledger", "ledgerreplay", "basewrite"
    ];

    private static string Normalize(string value) =>
        new(value.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray());

    private static string FindRoot()
    {
        DirectoryInfo? current = new(AppContext.BaseDirectory);
        while (current is not null)
        {
            if (File.Exists(Path.Combine(current.FullName, "Trureturing.Pages.slnx")))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        throw new InvalidOperationException("Repository root not found.");
    }
}
