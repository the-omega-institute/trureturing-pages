using System.Xml.Linq;
using Xunit;

namespace Trureturing.Pages.ArchitectureTests;

public sealed class TruthConsumptionBoundaryTests
{
    [Fact]
    public void PagesIngressAndCoreOwnAViewPortAndNotTheUpstreamWire()
    {
        string root = FindRoot();
        string[] projectPaths = BoundaryProjectFiles(root).ToArray();
        string source = string.Join(
            "\n",
            BoundarySourceFiles(root).Select(File.ReadAllText));

        foreach (string project in BoundaryProjects)
        {
            Assert.Contains(
                Path.Combine(root, "src", project, $"{project}.csproj"),
                projectPaths);
        }

        Assert.Null(FindForbiddenUpstreamToken(new[] { source }));
        Assert.Null(FindForbiddenProjectReference(
            projectPaths.Select(File.ReadAllText)));
        Assert.Contains(PagesPortSchema, source, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(
        "<PackageReference Include=\"Trureturing.Truth.Wire\" />",
        "trureturingtruth")]
    [InlineData(
        "<ProjectReference Include=\"../../truth/StrataLint.TruthGraph.csproj\" />",
        "stratalinttruthgraph")]
    public void UpstreamWireDependenciesInProjectFilesAreRejected(
        string projectFile,
        string expectedToken)
    {
        Assert.Equal(
            expectedToken,
            FindForbiddenProjectReference(new[] { projectFile }));
    }

    [Fact]
    public void XmlEntityEncodedUpstreamPackageReferenceIsRejected()
    {
        const string projectFile = """
            <Project>
              <ItemGroup>
                <PackageReference
                    Include = " Trureturing&#x2E;Truth&#46;Wire " />
              </ItemGroup>
            </Project>
            """;

        Assert.Equal(
            "trureturingtruth",
            FindForbiddenProjectReference(new[] { projectFile }));
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

    private static readonly string[] BoundaryProjects =
    [
        "Trureturing.Pages.Core",
        "Trureturing.Pages.Cli"
    ];

    private static readonly string[] ForbiddenUpstreamTokens =
    [
        "stratalinttruthgraph", "stratalinttruthexport",
        "truthgraphv1", "truthexportv1", "truthreleasev1",
        "trureturingtruth", "readtruthgraph", "readtruthexport",
        "frozenledger", "ledgerreplay", "basewrite"
    ];

    private static string Normalize(string value) =>
        new(value.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray());

    private static IEnumerable<string> BoundarySourceFiles(string root)
    {
        foreach (string project in BoundaryProjects)
        {
            string projectDirectory = Path.Combine(root, "src", project);
            foreach (string path in Directory.EnumerateFiles(
                projectDirectory,
                "*.cs",
                SearchOption.AllDirectories))
            {
                yield return path;
            }
        }
    }

    private static IEnumerable<string> BoundaryProjectFiles(string root) =>
        BoundaryProjects.Select(project => Path.Combine(
            root,
            "src",
            project,
            $"{project}.csproj"));

    private static string? FindForbiddenUpstreamToken(IEnumerable<string> documents)
    {
        string normalized = Normalize(string.Join("\n", documents));
        return ForbiddenUpstreamTokens.FirstOrDefault(token =>
            normalized.Contains(token, StringComparison.Ordinal));
    }

    private static string? FindForbiddenProjectReference(
        IEnumerable<string> projectDocuments)
    {
        foreach (string projectDocument in projectDocuments)
        {
            XDocument project = XDocument.Parse(projectDocument);
            IEnumerable<XElement> elements = project.Root?.DescendantsAndSelf() ?? [];
            foreach (XElement reference in elements.Where(element => element.Name.LocalName is
                         "PackageReference" or "ProjectReference"))
            {
                XAttribute? include = reference.Attributes().FirstOrDefault(attribute =>
                    attribute.Name.LocalName == "Include");
                if (include is null)
                {
                    continue;
                }

                string? forbiddenToken = FindForbiddenUpstreamToken(
                    new[] { include.Value });
                if (forbiddenToken is not null)
                {
                    return forbiddenToken;
                }
            }
        }

        return null;
    }

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
