using Xunit;

namespace Trureturing.Pages.ArchitectureTests;

public sealed class AtlasProjectionBoundaryTests
{
    [Fact]
    public void ProductionWorkflowHasOneCSharpAtlasProjectionOwner()
    {
        string root = FindRoot();
        string workflow = File.ReadAllText(
            Path.Combine(root, ".github", "workflows", "pages.yml"));

        Assert.Equal(
            1,
            CountOccurrences(workflow, "project-atlas"));
        Assert.Contains(
            "Trureturing.Pages.Cli.dll",
            workflow,
            StringComparison.Ordinal);
        Assert.DoesNotContain(
            "lib.certified_topology",
            workflow,
            StringComparison.Ordinal);
        Assert.Contains(
            "pages-atlas-view.v1.json",
            workflow,
            StringComparison.Ordinal);
        Assert.Contains(
            "pages-atlas-manifest.v1.json",
            workflow,
            StringComparison.Ordinal);
    }

    [Fact]
    public void LegacyManualWorkflowOnlyDelegatesToTheCanonicalPipeline()
    {
        string root = FindRoot();
        string workflow = File.ReadAllText(
            Path.Combine(
                root,
                ".github",
                "workflows",
                "deploy-real-dag.yml"));

        Assert.Contains(
            "gh workflow run pages.yml",
            workflow,
            StringComparison.Ordinal);
        Assert.DoesNotContain(
            "actions/deploy-pages",
            workflow,
            StringComparison.Ordinal);
        Assert.DoesNotContain(
            "actions/upload-pages-artifact",
            workflow,
            StringComparison.Ordinal);
        Assert.DoesNotContain(
            "lib.certified_topology",
            workflow,
            StringComparison.Ordinal);
        Assert.DoesNotContain(
            "human_labels.py",
            workflow,
            StringComparison.Ordinal);
    }

    [Fact]
    public void AtlasManifestKeepsTopologyAtlasAndConformationAsSidecars()
    {
        string root = FindRoot();
        string schema = File.ReadAllText(
            Path.Combine(
                root,
                "contracts",
                "pages-atlas-manifest.v1.schema.json"));

        Assert.Contains(
            "\"topology_atlas_digest\"",
            schema,
            StringComparison.Ordinal);
        Assert.Contains(
            "\"conformation_digest\"",
            schema,
            StringComparison.Ordinal);
        Assert.Contains(
            "\"pages-atlas-projection-v1\"",
            schema,
            StringComparison.Ordinal);
    }

    private static int CountOccurrences(
        string value,
        string term)
    {
        int count = 0;
        int start = 0;
        while (true)
        {
            int position = value.IndexOf(
                term,
                start,
                StringComparison.Ordinal);
            if (position < 0)
            {
                return count;
            }

            count++;
            start = position + term.Length;
        }
    }

    private static string FindRoot()
    {
        DirectoryInfo? current = new(AppContext.BaseDirectory);
        while (current is not null)
        {
            if (File.Exists(
                    Path.Combine(
                        current.FullName,
                        "Trureturing.Pages.slnx")))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        throw new InvalidOperationException(
            "Repository root not found.");
    }
}
