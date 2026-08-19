using System.Text.Json;

namespace Trureturing.Pages.Core;

internal static class StrictJson
{
    internal static JsonDocument Parse(ReadOnlySpan<byte> utf8, string label)
    {
        if (utf8.IsEmpty)
        {
            throw new ProjectionException($"{label} is empty");
        }

        var bytes = utf8.ToArray();
        try
        {
            var reader = new Utf8JsonReader(
                bytes,
                new JsonReaderOptions
                {
                    AllowTrailingCommas = false,
                    CommentHandling = JsonCommentHandling.Disallow,
                });
            var objectMembers = new Stack<HashSet<string>>();
            while (reader.Read())
            {
                switch (reader.TokenType)
                {
                    case JsonTokenType.StartObject:
                        objectMembers.Push(new HashSet<string>(StringComparer.Ordinal));
                        break;
                    case JsonTokenType.PropertyName:
                    {
                        if (objectMembers.Count == 0)
                        {
                            throw new ProjectionException($"{label} has a property outside an object");
                        }

                        var name = reader.GetString()
                            ?? throw new ProjectionException($"{label} has a null property name");
                        if (!objectMembers.Peek().Add(name))
                        {
                            throw new ProjectionException(
                                $"{label} has duplicate object member '{name}'");
                        }

                        break;
                    }
                    case JsonTokenType.EndObject:
                        _ = objectMembers.Pop();
                        break;
                }
            }

            return JsonDocument.Parse(
                bytes,
                new JsonDocumentOptions
                {
                    AllowTrailingCommas = false,
                    CommentHandling = JsonCommentHandling.Disallow,
                });
        }
        catch (ProjectionException)
        {
            throw;
        }
        catch (JsonException exception)
        {
            throw new ProjectionException($"{label} is invalid JSON", exception);
        }
        catch (InvalidOperationException exception)
        {
            throw new ProjectionException($"{label} has invalid JSON structure", exception);
        }
    }
}
