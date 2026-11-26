using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OnShop.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSlideStyles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "StyleJson",
                table: "Slides",
                type: "text",
                nullable: false,
                defaultValue: "{}");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "StyleJson",
                table: "Slides");
        }
    }
}
