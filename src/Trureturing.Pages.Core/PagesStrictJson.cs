using System.Globalization;
using System.Numerics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Trureturing.Pages.Core;

internal static class PagesStrictJson
{
    private static readonly JsonSerializerOptions OutputOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = false,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        AllowTrailingCommas = false,
        ReadCommentHandling = JsonCommentHandling.Disallow,
        WriteIndented = true
    };

    public static JsonDocument Parse(
        ReadOnlySpan<byte> bytes,
        string label)
    {
        JsonDocument? document = null;
        try
        {
            document = JsonDocument.Parse(
                bytes.ToArray(),
                new JsonDocumentOptions
                {
                    AllowTrailingCommas = false,
                    CommentHandling = JsonCommentHandling.Disallow
                });
            ValidateStrictValue(document.RootElement, "$" );
            return document;
        }
        catch (JsonException exception)
        {
            document?.Dispose();
            throw new InvalidDataException(
                $"{label} is not one strict JSON document: {exception.Message}",
                exception);
        }
        catch
        {
            document?.Dispose();
            throw;
        }
    }

    public static void RequireExactProperties(
        JsonElement value,
        IReadOnlyCollection<string> expected,
        string path)
    {
        if (value.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException($"{path} must be an object.");
        }

        var actual = value.EnumerateObject()
            .Select(property => property.Name)
            .ToHashSet(StringComparer.Ordinal);
        var expectedSet = expected.ToHashSet(StringComparer.Ordinal);
        if (!actual.SetEquals(expectedSet))
        {
            string missing = string.Join(
                ", ",
                expectedSet.Where(name => !actual.Contains(name))
                    .Order(StringComparer.Ordinal));
            string extra = string.Join(
                ", ",
                actual.Where(name => !expectedSet.Contains(name))
                    .Order(StringComparer.Ordinal));
            throw new InvalidDataException(
                $"{path} field set mismatch (missing=[{missing}], extra=[{extra}]).");
        }
    }

    public static JsonElement RequiredProperty(
        JsonElement parent,
        string name,
        JsonValueKind kind,
        string path)
    {
        if (!parent.TryGetProperty(name, out JsonElement value) ||
            value.ValueKind != kind)
        {
            throw new InvalidDataException(
                $"{path}.{name} must be a {kind}.");
        }

        return value;
    }

    public static string RequiredString(
        JsonElement parent,
        string name,
        string path)
    {
        JsonElement value = RequiredProperty(
            parent,
            name,
            JsonValueKind.String,
            path);
        string? result = value.GetString();
        return string.IsNullOrWhiteSpace(result)
            ? throw new InvalidDataException(
                $"{path}.{name} must be non-empty.")
            : result;
    }

    public static string RequiredString(
        JsonObject parent,
        string name,
        string path)
    {
        if (parent[name] is not JsonValue value ||
            !value.TryGetValue(out string? result) ||
            string.IsNullOrWhiteSpace(result))
        {
            throw new InvalidDataException(
                $"{path}.{name} must be a non-empty string.");
        }

        return result!;
    }

    public static JsonObject RequireObject(
        JsonObject parent,
        string name,
        string path) =>
        parent[name] as JsonObject
        ?? throw new InvalidDataException($"{path}.{name} must be an object.");

    public static JsonArray RequireArray(
        JsonObject parent,
        string name,
        string path) =>
        parent[name] as JsonArray
        ?? throw new InvalidDataException($"{path}.{name} must be an array.");

    public static long RequiredNonNegativeInt64(
        JsonElement parent,
        string name,
        string path)
    {
        JsonElement value = RequiredProperty(
            parent,
            name,
            JsonValueKind.Number,
            path);
        if (!value.TryGetInt64(out long result) || result < 0)
        {
            throw new InvalidDataException(
                $"{path}.{name} must be a non-negative Int64 integer.");
        }

        return result;
    }

    public static BigInteger RequiredBigInteger(
        JsonElement parent,
        string name,
        string path)
    {
        JsonElement value = RequiredProperty(
            parent,
            name,
            JsonValueKind.Number,
            path);
        try
        {
            return BigInteger.Parse(
                value.GetRawText(),
                CultureInfo.InvariantCulture);
        }
        catch (FormatException exception)
        {
            throw new InvalidDataException(
                $"{path}.{name} must be an integer.",
                exception);
        }
    }

    public static void RequireSha256(
        string value,
        string path)
    {
        if (value.Length != 71 ||
            !value.StartsWith("sha256:", StringComparison.Ordinal) ||
            !IsLowerHex(value.AsSpan("sha256:".Length)))
        {
            throw new InvalidDataException(
                $"{path} must use sha256:<64 lowercase hex>.");
        }
    }

    public static void RequireGitPair(
        string commit,
        string tree)
    {
        if (!IsGitObject(commit) ||
            !IsGitObject(tree) ||
            commit.Length != tree.Length)
        {
            throw new InvalidDataException(
                "source_commit and source_tree must use matching lowercase Git object IDs.");
        }
    }

    public static void RequireGitCommit(
        string value,
        string path)
    {
        if (value.Length != 40 ||
            !IsLowerHex(value.AsSpan()))
        {
            throw new InvalidDataException(
                $"{path} must be a lowercase 40-hex Git commit.");
        }
    }

    public static string Sha256(ReadOnlySpan<byte> bytes) =>
        $"sha256:{Convert.ToHexStringLower(SHA256.HashData(bytes))}";

    public static byte[] SerializeNode(JsonNode value) =>
        Encoding.UTF8.GetBytes(value.ToJsonString(OutputOptions) + "\n");

    public static byte[] SerializeValue<T>(T value) =>
        JsonSerializer.SerializeToUtf8Bytes(value, OutputOptions)
            .Concat([(byte)'\n'])
            .ToArray();

    private static void ValidateStrictValue(
        JsonElement value,
        string path)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (JsonProperty property in value.EnumerateObject())
            {
                if (!names.Add(property.Name))
                {
                    throw new InvalidDataException(
                        $"{path} contains duplicate object member {property.Name}.");
                }

                ValidateStrictValue(
                    property.Value,
                    $"{path}.{property.Name}");
            }
        }
        else if (value.ValueKind == JsonValueKind.Array)
        {
            int index = 0;
            foreach (JsonElement item in value.EnumerateArray())
            {
                ValidateStrictValue(item, $"{path}[{index}]");
                index++;
            }
        }
        else if (value.ValueKind == JsonValueKind.Number)
        {
            string lexeme = value.GetRawText();
            if (lexeme.Contains('.', StringComparison.Ordinal) ||
                lexeme.Contains('e', StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidDataException(
                    $"{path} contains a floating-point numeric lexeme.");
            }
        }
    }

    private static bool IsGitObject(string value) =>
        value.Length is 40 or 64 && IsLowerHex(value.AsSpan());

    private static bool IsLowerHex(ReadOnlySpan<char> value)
    {
        foreach (char character in value)
        {
            if (character is not (>= '0' and <= '9') and
                not (>= 'a' and <= 'f'))
            {
                return false;
            }
        }

        return true;
    }
}
