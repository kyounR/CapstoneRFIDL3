from django.db import migrations, models
import django.db.models.deletion


def copy_route_names_to_lines(apps, schema_editor):
    Line = apps.get_model('core', 'Line')
    Vehicle = apps.get_model('core', 'Vehicle')

    for vehicle in Vehicle.objects.exclude(route_name__isnull=True).iterator():
        line, _ = Line.objects.get_or_create(name=vehicle.route_name)
        vehicle.line_id = line.pk
        vehicle.save(update_fields=['line'])


def reverse_copy_lines_to_route_names(apps, schema_editor):
    Line = apps.get_model('core', 'Line')
    Vehicle = apps.get_model('core', 'Vehicle')

    for vehicle in Vehicle.objects.select_related('line').iterator():
        vehicle.route_name = vehicle.line.name
        vehicle.save(update_fields=['route_name'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_destination_capacity_limit'),
    ]

    operations = [
        migrations.CreateModel(
            name='Line',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255, unique=True)),
            ],
        ),
        migrations.AddField(
            model_name='vehicle',
            name='line',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='vehicles',
                to='core.line',
            ),
        ),
        migrations.RunPython(copy_route_names_to_lines, reverse_copy_lines_to_route_names),
        migrations.RemoveField(
            model_name='vehicle',
            name='route_name',
        ),
        migrations.AlterField(
            model_name='vehicle',
            name='line',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='vehicles',
                to='core.line',
            ),
        ),
    ]
