using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Reflection;
using Trureturing.Pages.Core;
using Xunit;

namespace Trureturing.Pages.Tests;

public sealed class PortValidationTests
{
    public static TheoryData<string> TruthReleaseRequiredFields => new()
    {
        "schema",
        "release_digest",
        "source_commit",
        "source_tree",
        "module_nodes",
        "module_edges",
        "frozen_nodes",
        "frozen_edges",
        "document_anchors"
    };

    public static TheoryData<string, string> TruthReleaseRequiredItemFields => new()
    {
        { "module_nodes", "id" },
        { "module_nodes", "title" },
        { "module_nodes", "state" },
        { "module_nodes", "depth" },
        { "module_nodes", "repo_path" },
        { "module_edges", "dependency" },
        { "module_edges", "dependent" },
        { "frozen_nodes", "frozen_node_id" },
        { "frozen_nodes", "repo_path" },
        { "frozen_nodes", "declaration_ids" },
        { "frozen_nodes", "axiom_closure" },
        { "frozen_edges", "prerequisite_frozen_node_id" },
        { "frozen_edges", "dependent_frozen_node_id" },
        { "document_anchors", "node_id" },
        { "document_anchors", "mdbook_path" }
    };

    public static TheoryData<string> IntuitionOverlayRequiredFields => new()
    {
        "schema",
        "source_truth_release_digest",
        "relations"
    };

    public static TheoryData<string> IntuitionOverlayRequiredItemFields => new()
    {
        "relation_id",
        "relation_type",
        "status",
        "inputs",
        "outputs",
        "evidence_refs"
    };

    [Theory]
    [MemberData(nameof(TruthReleaseRequiredFields))]
    public void TruthReleaseReaderRejectsMissingRequiredField(string field)
    {
        JsonObject document = Parse(PagesPortJson.Write(Port()));
        Assert.True(document.Remove(field));

        Assert.Throws<InvalidDataException>(
            () => PagesPortJson.ReadTruthReleasePort(JsonSerializer.SerializeToUtf8Bytes(document)));
    }

    [Theory]
    [MemberData(nameof(TruthReleaseRequiredItemFields))]
    public void TruthReleaseReaderRejectsMissingRequiredItemField(string collection, string field)
    {
        JsonObject document = Parse(PagesPortJson.Write(Port()));
        JsonObject item = document[collection]![0]!.AsObject();
        Assert.True(item.Remove(field));

        Assert.Throws<InvalidDataException>(
            () => PagesPortJson.ReadTruthReleasePort(JsonSerializer.SerializeToUtf8Bytes(document)));
    }

    [Theory]
    [MemberData(nameof(IntuitionOverlayRequiredFields))]
    public void IntuitionOverlayReaderRejectsMissingRequiredField(string field)
    {
        JsonObject document = Parse(PagesPortJson.Write(Overlay()));
        Assert.True(document.Remove(field));

        Assert.Throws<InvalidDataException>(
            () => PagesPortJson.ReadIntuitionOverlay(JsonSerializer.SerializeToUtf8Bytes(document)));
    }

    [Theory]
    [MemberData(nameof(IntuitionOverlayRequiredItemFields))]
    public void IntuitionOverlayReaderRejectsMissingRequiredItemField(string field)
    {
        JsonObject document = Parse(PagesPortJson.Write(Overlay()));
        JsonObject relation = document["relations"]![0]!.AsObject();
        Assert.True(relation.Remove(field));

        Assert.Throws<InvalidDataException>(
            () => PagesPortJson.ReadIntuitionOverlay(JsonSerializer.SerializeToUtf8Bytes(document)));
    }

    [Fact]
    public void ProjectionRevalidatesABypassConstructedPort()
    {
        PagesTruthReleasePort port = Port() with
        {
            ModuleEdges = new[]
            {
                new PagesModuleEdge("A", "B"),
                new PagesModuleEdge("B", "A")
            }
        };

        InvalidDataException error = Assert.Throws<InvalidDataException>(
            () => PagesDagProjection.Build(port));

        Assert.Contains("module graph", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void BothGraphLayersRejectDuplicateEdges()
    {
        PagesTruthReleasePort moduleDuplicate = Port() with
        {
            ModuleEdges = new[]
            {
                new PagesModuleEdge("A", "B"),
                new PagesModuleEdge("A", "B")
            }
        };
        PagesTruthReleasePort frozenDuplicate = Port() with
        {
            FrozenEdges = new[]
            {
                new PagesFrozenEdge(Hash('c'), Hash('e')),
                new PagesFrozenEdge(Hash('c'), Hash('e'))
            }
        };

        Assert.Throws<InvalidDataException>(() => PagesDagProjection.Build(moduleDuplicate));
        Assert.Throws<InvalidDataException>(() => PagesDagProjection.Build(frozenDuplicate));
    }

    [Fact]
    public void OverlayEndpointsMustBeCertifiedNodeIds()
    {
        var overlay = new PagesIntuitionOverlay(
            PagesSchemas.IntuitionOverlay,
            Port().ReleaseDigest,
            new[]
            {
                new PagesCandidateRelation(
                    "relation-1", "bridge", "proposed",
                    new[] { "module:A" }, new[] { "module:missing" }, Array.Empty<string>())
            });

        InvalidDataException error = Assert.Throws<InvalidDataException>(
            () => PagesDagProjection.Build(Port(), overlay));

        Assert.Contains("not a certified node", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ProjectionPublishesEveryTruthNodeAndOnlyClosedEdges()
    {
        PagesTruthReleasePort port = Port();
        PagesDagRoot root = PagesDagProjection.Build(port).Root;

        Assert.Equal(
            port.ModuleNodes.Count + port.FrozenNodes.Count,
            root.Nodes.Count);
        Assert.All(port.ModuleNodes, node =>
            Assert.Contains(root.Nodes, projected => projected.Id == "module:" + node.Id));
        Assert.All(port.FrozenNodes, node =>
            Assert.Contains(root.Nodes, projected => projected.Id == "frozen:" + node.FrozenNodeId));
        Assert.All(root.Edges, edge =>
            Assert.Contains(root.Nodes, node => node.Id == edge.Source));
        Assert.All(root.Edges, edge =>
            Assert.Contains(root.Nodes, node => node.Id == edge.Target));
    }

    [Fact]
    public void PublishedSchemasMatchTypedRecordProperties()
    {
        string root = FindRoot();
        AssertSchemaMatches(
            Path.Combine(root, "contracts", "pages-truth-release-port.v1.schema.json"),
            typeof(PagesTruthReleasePort));
        AssertSchemaMatches(
            Path.Combine(root, "contracts", "pages-intuition-overlay.v1.schema.json"),
            typeof(PagesIntuitionOverlay));
    }

    private static void AssertSchemaMatches(string path, Type recordType)
    {
        using JsonDocument document = JsonDocument.Parse(File.ReadAllBytes(path));
        JsonElement root = document.RootElement;
        Assert.False(root.GetProperty("additionalProperties").GetBoolean());
        AssertRecordObject(root, recordType);

        foreach (PropertyInfo property in recordType.GetProperties())
        {
            if (!IsRecordList(property.PropertyType, out Type? itemType))
            {
                continue;
            }

            JsonElement itemSchema = root.GetProperty("properties")
                .GetProperty(ToSnake(property.Name)).GetProperty("items");
            Assert.True(itemSchema.ValueKind == JsonValueKind.Object);
            if (itemType!.IsClass && itemType != typeof(string))
            {
                AssertRecordObject(itemSchema, itemType);
            }
            else
            {
                Assert.Equal("string", itemSchema.GetProperty("type").GetString());
            }
        }
    }

    private static void AssertRecordObject(JsonElement schema, Type recordType)
    {
        Assert.False(schema.GetProperty("additionalProperties").GetBoolean());
        var expected = recordType.GetProperties()
            .Select(property => ToSnake(property.Name))
            .ToHashSet(StringComparer.Ordinal);
        var actual = schema.GetProperty("properties").EnumerateObject()
            .Select(property => property.Name)
            .ToHashSet(StringComparer.Ordinal);
        var required = schema.GetProperty("required").EnumerateArray()
            .Select(property => property.GetString()!)
            .ToHashSet(StringComparer.Ordinal);
        Assert.True(expected.SetEquals(actual));
        Assert.True(expected.SetEquals(required));
    }

    private static bool IsRecordList(Type type, out Type? itemType)
    {
        itemType = type.IsGenericType &&
            type.GetGenericTypeDefinition() == typeof(IReadOnlyList<>)
            ? type.GetGenericArguments()[0]
            : null;
        return itemType is not null;
    }

    private static string ToSnake(string name) =>
        JsonNamingPolicy.SnakeCaseLower.ConvertName(name);

    private static PagesTruthReleasePort Port() => new(
        PagesSchemas.TruthReleasePort,
        Sha('1'),
        new string('a', 40),
        new string('b', 40),
        new[]
        {
            new PagesModuleNode("A", "A", "closed", 0, "A.lean"),
            new PagesModuleNode("B", "B", "open", 1, "B.lean")
        },
        new[] { new PagesModuleEdge("A", "B") },
        new[]
        {
            new PagesFrozenNode(Hash('c'), "C.lean", new[] { "C.theorem" }, Array.Empty<string>()),
            new PagesFrozenNode(Hash('e'), "E.lean", new[] { "E.theorem" }, Array.Empty<string>())
        },
        new[] { new PagesFrozenEdge(Hash('c'), Hash('e')) },
        new[] { new PagesDocumentAnchor("A", "Blueprint/A.html") });

    private static PagesIntuitionOverlay Overlay() => new(
        PagesSchemas.IntuitionOverlay,
        Port().ReleaseDigest,
        new[]
        {
            new PagesCandidateRelation(
                "relation-1",
                "bridge",
                "proposed",
                new[] { "module:A" },
                new[] { "module:B" },
                Array.Empty<string>())
        });

    private static JsonObject Parse(byte[] bytes) =>
        JsonNode.Parse(bytes)?.AsObject()
        ?? throw new InvalidOperationException("Test fixture did not serialize to a JSON object.");

    private static string Sha(char value) => "sha256:" + new string(value, 64);
    private static string Hash(char value) => "sha256:" + new string(value, 64);

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
