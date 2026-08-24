namespace Trureturing.Pages.ArchitectureTests;

public sealed class TruthConsumptionBoundaryTests
{
    [Fact]
    public void PagesCoreOwnsAViewPortAndNotTheUpstreamWire()
    {
        string root = FindRoot();
        string sourceRoot = Path.Combine(root, "src", "Trureturing.Pages.Core");
        string text = string.Join(
            "\n",
            Directory.EnumerateFiles(sourceRoot, "*.cs", SearchOption.AllDirectories)
                .OrderBy(path => path, StringComparer.Ordinal)
                .Select(File.ReadAllText));

        Assert.DoesNotContain("stratalint.truth-graph", text, StringComparison.Ordinal);
        Assert.DoesNotContain("stratalint.truth-export", text, StringComparison.Ordinal);
        Assert.DoesNotContain("FrozenLedger", text, StringComparison.Ordinal);
        Assert.DoesNotContain("Trureturing.Truth", text, StringComparison.Ordinal);
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
            if (path.Contains($"{Path.DirectorySeparatorChar}.git{Path.DirectorySeparatorChar}",
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
